/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DEFAULT_BULK_CONCURRENCY } from "./constants.js";
import { WhatsAppError } from "./errors.js";
import { HttpClient, type RequestOptions } from "./http.js";
import type {
  WhatsAppConfig,
  SendMessageResponse,
  SendOptions,
  SuccessResponse,
  MediaPayload,
  MediaType,
  BinaryInput,
  UploadMediaResponse,
  ResumableUploadResponse,
  MediaInfo,
  DownloadedMedia,
  LocationPayload,
  ContactCard,
  InteractiveButtonsPayload,
  InteractiveListPayload,
  CtaUrlPayload,
  Template,
  GetTemplatesOptions,
  CreateTemplatePayload,
  CreateTemplateResponse,
  SendTemplatePayload,
  TemplateSendComponent,
  TemplateAnalyticsRequest,
  TemplateAnalyticsResponse,
  BulkSendOptions,
  BulkSendItemResult,
  BulkSendResult,
  BusinessProfile,
  UpdateBusinessProfilePayload,
  QRCode,
  DisplayNameInfo,
  Paged,
} from "./types.js";

const DEFAULT_TEMPLATE_FIELDS = ["name", "language", "status", "category", "components", "quality_score"];

/**
 * WhatsApp Cloud API Client
 *
 * Encapsulates all WhatsApp Cloud API operations:
 * - Messages: text, media, location, contacts, interactive, reactions, templates, read receipts
 * - Media: upload (direct & resumable), URL lookup, download, delete
 * - Templates: CRUD + pagination + analytics
 * - Bulk: concurrent template sending with rate-limit backoff
 * - Business profile, QR codes, display name, messaging limit
 */
export class WhatsAppClient {
  private readonly http: HttpClient;
  private readonly phoneId: string;
  private readonly wabaId?: string;

  constructor(config: WhatsAppConfig) {
    if (!config.token) throw new TypeError("WhatsAppClient: `token` is required.");
    if (!config.phoneId) throw new TypeError("WhatsAppClient: `phoneId` is required.");

    this.phoneId = config.phoneId;
    this.wabaId = config.wabaId;
    this.http = new HttpClient(config);
  }

  // ─── Messages ────────────────────────────────────────────────

  /**
   * Send a text message
   */
  async sendText(
    to: string,
    body: string,
    options?: SendOptions & { previewUrl?: boolean },
  ): Promise<SendMessageResponse> {
    return this.send(
      to,
      { type: "text", text: { body, ...(options?.previewUrl && { preview_url: true }) } },
      options,
    );
  }

  /**
   * Send a media message (image, video, audio, document, sticker)
   * from a public URL or an uploaded media ID
   */
  async sendMedia(to: string, media: MediaPayload, options?: SendOptions): Promise<SendMessageResponse> {
    return this.send(to, { type: media.type, [media.type]: buildMediaObject(media) }, options);
  }

  /**
   * Send a reaction emoji to an existing message. Pass an empty string to remove it.
   */
  async sendReaction(
    to: string,
    messageId: string,
    emoji: string,
    options?: RequestOptions,
  ): Promise<SendMessageResponse> {
    return this.send(to, { type: "reaction", reaction: { message_id: messageId, emoji } }, options);
  }

  /**
   * Send a location pin
   */
  async sendLocation(to: string, location: LocationPayload, options?: SendOptions): Promise<SendMessageResponse> {
    return this.send(to, { type: "location", location }, options);
  }

  /**
   * Send one or more contact cards
   */
  async sendContacts(to: string, contacts: ContactCard[], options?: SendOptions): Promise<SendMessageResponse> {
    return this.send(to, { type: "contacts", contacts }, options);
  }

  /**
   * Send an interactive buttons message (up to 3 reply buttons)
   */
  async sendInteractiveButtons(
    to: string,
    payload: InteractiveButtonsPayload,
    options?: SendOptions,
  ): Promise<SendMessageResponse> {
    return this.send(
      to,
      {
        type: "interactive",
        interactive: {
          type: "button",
          ...(payload.header && { header: payload.header }),
          body: { text: payload.body },
          ...(payload.footer && { footer: { text: payload.footer } }),
          action: {
            buttons: payload.buttons.map((btn) => ({
              type: "reply",
              reply: { id: btn.id, title: btn.title },
            })),
          },
        },
      },
      options,
    );
  }

  /**
   * Send an interactive list message (a button that opens a menu of up to 10 rows)
   */
  async sendInteractiveList(
    to: string,
    payload: InteractiveListPayload,
    options?: SendOptions,
  ): Promise<SendMessageResponse> {
    return this.send(
      to,
      {
        type: "interactive",
        interactive: {
          type: "list",
          ...(payload.header && { header: { type: "text", text: payload.header } }),
          body: { text: payload.body },
          ...(payload.footer && { footer: { text: payload.footer } }),
          action: {
            button: payload.buttonText,
            sections: payload.sections,
          },
        },
      },
      options,
    );
  }

  /**
   * Send a call-to-action URL button message
   */
  async sendCtaUrl(to: string, payload: CtaUrlPayload, options?: SendOptions): Promise<SendMessageResponse> {
    return this.send(
      to,
      {
        type: "interactive",
        interactive: {
          type: "cta_url",
          ...(payload.header && { header: payload.header }),
          body: { text: payload.body },
          ...(payload.footer && { footer: { text: payload.footer } }),
          action: {
            name: "cta_url",
            parameters: { display_text: payload.buttonText, url: payload.url },
          },
        },
      },
      options,
    );
  }

  /**
   * Send a template message to a single recipient
   */
  async sendTemplate(
    to: string,
    template: SendTemplatePayload,
    options?: SendOptions,
  ): Promise<SendMessageResponse> {
    return this.send(
      to,
      {
        type: "template",
        template: {
          name: template.name,
          language: { code: template.language, policy: "deterministic" },
          ...(template.components && { components: template.components }),
        },
      },
      options,
    );
  }

  /**
   * Send a template message to many recipients with bounded concurrency.
   * Rate-limit errors (e.g. 130429) are retried with exponential backoff
   * according to the client's `retry` config. Never throws for individual
   * failures — check `result.results`.
   */
  async sendTemplateBulk(
    recipients: string[],
    template: SendTemplatePayload,
    options?: BulkSendOptions,
  ): Promise<BulkSendResult> {
    const total = recipients.length;
    const results = new Array<BulkSendItemResult>(total);
    const concurrency = Math.max(1, options?.concurrency ?? DEFAULT_BULK_CONCURRENCY);
    const requestOptions: RequestOptions = { signal: options?.signal, timeoutMs: options?.timeoutMs };
    let next = 0;
    let completed = 0;

    const worker = async () => {
      while (next < total) {
        const index = next++;
        const phone = recipients[index]!;
        const components = lookupComponents(options?.components, phone);
        let result: BulkSendItemResult;

        try {
          const response = await this.sendTemplate(
            phone,
            components ? { ...template, components } : template,
            requestOptions,
          );
          result = { phone, success: true, wamid: response.messages[0]?.id };
        } catch (err) {
          result = {
            phone,
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
            ...(err instanceof WhatsAppError && err.code !== undefined && { errorCode: err.code }),
          };
        }

        results[index] = result;
        completed++;
        options?.onProgress?.(result, completed, total);
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));

    const successful = results.filter((r) => r.success).length;
    return { total, successful, failed: total - successful, results };
  }

  /**
   * Mark an incoming message as read (blue ticks). Optionally show a
   * typing indicator for up to 25 seconds or until you reply.
   */
  async markAsRead(
    messageId: string,
    options?: RequestOptions & { typingIndicator?: boolean },
  ): Promise<SuccessResponse> {
    return this.http.request<SuccessResponse>(
      {
        method: "POST",
        path: `/${this.phoneId}/messages`,
        json: {
          messaging_product: "whatsapp",
          status: "read",
          message_id: messageId,
          ...(options?.typingIndicator && { typing_indicator: { type: "text" } }),
        },
      },
      options,
    );
  }

  /**
   * Send any message payload as-is — an escape hatch for message types this
   * client doesn't wrap yet. `messaging_product` and `to` are added for you.
   */
  async sendRaw(
    to: string,
    payload: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<SendMessageResponse> {
    return this.send(to, payload, options);
  }

  // ─── Media ───────────────────────────────────────────────────

  /**
   * Upload media directly to WhatsApp (returns media_id for sending).
   * Uploaded media is kept by WhatsApp for 30 days.
   */
  async uploadMedia(
    file: BinaryInput,
    mimeType: string,
    filename: string,
    options?: RequestOptions,
  ): Promise<UploadMediaResponse> {
    const formData = new FormData();
    formData.append("messaging_product", "whatsapp");
    formData.append("type", mimeType);
    formData.append("file", toBlob(file, mimeType), filename);

    return this.http.request<UploadMediaResponse>(
      { method: "POST", path: `/${this.phoneId}/media`, body: formData },
      options,
    );
  }

  /**
   * Upload media via resumable API (returns asset handle for templates)
   *
   * Two-step process:
   * 1. Create upload session → get session ID
   * 2. Upload file data → get asset handle
   */
  async uploadMediaResumable(
    file: BinaryInput,
    mimeType: string,
    filename: string,
    options?: RequestOptions,
  ): Promise<ResumableUploadResponse> {
    const blob = toBlob(file, mimeType);

    // Step 1: Create upload session
    const session = await this.http.request<{ id: string }>(
      {
        method: "POST",
        path: "/app/uploads",
        json: { file_length: blob.size, file_type: mimeType, file_name: filename },
      },
      options,
    );

    // Step 2: Upload file data
    const result = await this.http.request<{ h: string }>(
      {
        method: "POST",
        path: `/${session.id}`,
        auth: "oauth",
        headers: { file_offset: "0", "Content-Type": mimeType },
        body: blob,
      },
      options,
    );
    return { handle: result.h };
  }

  /**
   * Get a temporary download URL (valid ~5 minutes) and metadata for a media ID
   * received in a webhook
   */
  async getMediaUrl(mediaId: string, options?: RequestOptions): Promise<MediaInfo> {
    return this.http.request<MediaInfo>(
      { method: "GET", path: `/${encodeURIComponent(mediaId)}`, query: { phone_number_id: this.phoneId } },
      options,
    );
  }

  /**
   * Download a media file by its ID (looks up the URL, then fetches the bytes)
   *
   * @example
   * const media = await wa.downloadMedia(message.image.id);
   * await fs.writeFile("photo.jpg", media.data);
   */
  async downloadMedia(mediaId: string, options?: RequestOptions): Promise<DownloadedMedia> {
    const info = await this.getMediaUrl(mediaId, options);
    const file = await this.http.requestBinary({ method: "GET", path: info.url }, options);
    return {
      data: file.data,
      mimeType: info.mime_type ?? file.contentType ?? "application/octet-stream",
      fileSize: file.data.byteLength,
      sha256: info.sha256,
    };
  }

  /**
   * Delete an uploaded media file
   */
  async deleteMedia(mediaId: string, options?: RequestOptions): Promise<SuccessResponse> {
    return this.http.request<SuccessResponse>(
      { method: "DELETE", path: `/${encodeURIComponent(mediaId)}`, query: { phone_number_id: this.phoneId } },
      options,
    );
  }

  // ─── Templates ───────────────────────────────────────────────

  /**
   * Get all message templates for this WABA (follows every page)
   */
  async getTemplates(options?: GetTemplatesOptions): Promise<Template[]> {
    const templates: Template[] = [];
    for await (const template of this.iterateTemplates(options)) templates.push(template);
    return templates;
  }

  /**
   * Stream templates page by page — useful for accounts with thousands of templates
   *
   * @example
   * for await (const template of wa.iterateTemplates({ status: ["APPROVED"] })) { ... }
   */
  iterateTemplates(options?: GetTemplatesOptions): AsyncGenerator<Template> {
    return this.paginate<Template>(
      `/${this.requireWabaId()}/message_templates`,
      {
        fields: (options?.fields ?? DEFAULT_TEMPLATE_FIELDS).join(","),
        status: options?.status?.join(","),
        category: options?.category,
        name: options?.name,
        language: options?.language,
        limit: options?.pageSize ?? 100,
      },
      options,
    );
  }

  /**
   * Get only template names + QUICK_REPLY buttons (lightweight).
   * Returns APPROVED and PENDING (in-review) templates with QUICK_REPLY buttons.
   */
  async getTemplateButtons(
    options?: RequestOptions,
  ): Promise<Array<{ templateName: string; buttons: string[] }>> {
    const result: Array<{ templateName: string; buttons: string[] }> = [];

    for await (const tmpl of this.iterateTemplates({
      ...options,
      fields: ["name", "status", "components"],
      status: ["APPROVED", "PENDING"],
      pageSize: 1000,
    })) {
      const buttonsComp = tmpl.components.find((c) => c.type === "BUTTONS");
      if (!buttonsComp?.buttons) continue;

      const quickReplies = buttonsComp.buttons.filter((b) => b.type === "QUICK_REPLY").map((b) => b.text);

      if (quickReplies.length > 0) {
        result.push({ templateName: tmpl.name, buttons: quickReplies });
      }
    }

    return result;
  }

  /**
   * Get a specific template by name.
   *
   * A name can have multiple language variants. When `language` is provided the
   * matching variant is returned (or null if that language doesn't exist);
   * otherwise the first variant is returned.
   */
  async getTemplate(name: string, language?: string, options?: RequestOptions): Promise<Template | null> {
    const templates = await this.getTemplates({
      ...options,
      name,
      fields: ["id", ...DEFAULT_TEMPLATE_FIELDS],
    });
    // Meta's name filter can return partial matches — require an exact one
    const exact = templates.filter((t) => t.name === name);
    if (language) {
      return exact.find((t) => t.language === language) ?? null;
    }
    return exact[0] ?? null;
  }

  /**
   * Create a new message template
   */
  async createTemplate(payload: CreateTemplatePayload, options?: RequestOptions): Promise<CreateTemplateResponse> {
    return this.http.request<CreateTemplateResponse>(
      {
        method: "POST",
        path: `/${this.requireWabaId()}/message_templates`,
        json: { messaging_product: "whatsapp", parameter_format: "positional", ...payload },
      },
      options,
    );
  }

  /**
   * Edit an existing template (limited to once per 24 hours by WhatsApp)
   */
  async editTemplate(
    templateId: string,
    payload: Partial<CreateTemplatePayload>,
    options?: RequestOptions,
  ): Promise<SuccessResponse> {
    return this.http.request<SuccessResponse>(
      {
        method: "POST",
        path: `/${encodeURIComponent(templateId)}`,
        json: { messaging_product: "whatsapp", ...payload },
      },
      options,
    );
  }

  /**
   * Delete a template by name (all languages), or a single language variant
   * when `templateId` is given
   */
  async deleteTemplate(
    name: string,
    options?: RequestOptions & { templateId?: string },
  ): Promise<SuccessResponse> {
    return this.http.request<SuccessResponse>(
      {
        method: "DELETE",
        path: `/${this.requireWabaId()}/message_templates`,
        query: { name, hsm_id: options?.templateId },
      },
      options,
    );
  }

  /**
   * Get analytics for specific templates.
   * Requires template insights to be enabled (see `enableTemplateInsights`).
   */
  async getTemplateAnalytics(
    params: TemplateAnalyticsRequest,
    options?: RequestOptions,
  ): Promise<TemplateAnalyticsResponse> {
    return this.http.request<TemplateAnalyticsResponse>(
      {
        method: "GET",
        path: `/${this.requireWabaId()}/template_analytics`,
        query: {
          start: Math.floor(params.start.getTime() / 1000),
          end: Math.floor(params.end.getTime() / 1000),
          granularity: params.granularity ?? "DAILY",
          metric_types: "cost,clicked,delivered,read,sent",
          template_ids: JSON.stringify(params.templateIds),
          limit: 100000,
        },
      },
      options,
    );
  }

  /**
   * Enable template insights for this WABA
   */
  async enableTemplateInsights(options?: RequestOptions): Promise<{ id: string }> {
    return this.http.request<{ id: string }>(
      {
        method: "POST",
        path: `/${this.requireWabaId()}`,
        json: { is_enabled_for_insights: true },
      },
      options,
    );
  }

  // ─── Business Profile ──────────────────────────────────────

  /**
   * Get the WhatsApp Business Profile
   */
  async getBusinessProfile(options?: RequestOptions): Promise<BusinessProfile> {
    const response = await this.http.request<{ data: BusinessProfile[] }>(
      {
        method: "GET",
        path: `/${this.phoneId}/whatsapp_business_profile`,
        query: { fields: "about,address,description,email,profile_picture_url,websites,vertical" },
      },
      options,
    );
    return response.data?.[0] ?? {};
  }

  /**
   * Update the WhatsApp Business Profile
   */
  async updateBusinessProfile(
    payload: UpdateBusinessProfilePayload,
    options?: RequestOptions,
  ): Promise<SuccessResponse> {
    return this.http.request<SuccessResponse>(
      {
        method: "POST",
        path: `/${this.phoneId}/whatsapp_business_profile`,
        json: { messaging_product: "whatsapp", ...payload },
      },
      options,
    );
  }

  // ─── QR Codes ─────────────────────────────────────────────

  /**
   * List all QR codes for this phone number
   */
  async getQRCodes(options?: RequestOptions): Promise<QRCode[]> {
    const response = await this.http.request<{ data?: QRCode[] }>(
      { method: "GET", path: `/${this.phoneId}/message_qrdls` },
      options,
    );
    return response.data ?? [];
  }

  /**
   * Get a single QR code's PNG image URL
   */
  async getQRCodeImage(code: string, options?: RequestOptions): Promise<string | null> {
    const response = await this.http.request<{ data?: Array<{ qr_image_url?: string }> }>(
      {
        method: "GET",
        path: `/${this.phoneId}/message_qrdls`,
        query: { fields: "prefilled_message,deep_link_url,qr_image_url.format(PNG)", code },
      },
      options,
    );
    return response.data?.[0]?.qr_image_url ?? null;
  }

  /**
   * Create a new QR code with a prefilled message
   */
  async createQRCode(prefilledMessage: string, options?: RequestOptions): Promise<QRCode> {
    return this.http.request<QRCode>(
      {
        method: "POST",
        path: `/${this.phoneId}/message_qrdls`,
        json: { prefilled_message: prefilledMessage, generate_qr_image: "PNG" },
      },
      options,
    );
  }

  /**
   * Update an existing QR code's prefilled message
   */
  async updateQRCode(code: string, prefilledMessage: string, options?: RequestOptions): Promise<QRCode> {
    return this.http.request<QRCode>(
      {
        method: "POST",
        path: `/${this.phoneId}/message_qrdls`,
        json: { code, prefilled_message: prefilledMessage },
      },
      options,
    );
  }

  /**
   * Delete a QR code
   */
  async deleteQRCode(code: string, options?: RequestOptions): Promise<SuccessResponse> {
    return this.http.request<SuccessResponse>(
      { method: "DELETE", path: `/${this.phoneId}/message_qrdls/${encodeURIComponent(code)}` },
      options,
    );
  }

  // ─── Display Name ───────────────────────────────────────────

  /**
   * Get current display name and pending name change status
   */
  async getDisplayName(options?: RequestOptions): Promise<DisplayNameInfo> {
    return this.http.request<DisplayNameInfo>(
      {
        method: "GET",
        path: `/${this.phoneId}`,
        query: {
          fields: "verified_name,name_status,display_phone_number,new_display_name,new_name_status,quality_rating",
        },
      },
      options,
    );
  }

  /**
   * Submit a new display name for review
   */
  async updateDisplayName(newName: string, options?: RequestOptions): Promise<SuccessResponse> {
    return this.http.request<SuccessResponse>(
      { method: "POST", path: `/${this.phoneId}`, query: { new_display_name: newName } },
      options,
    );
  }

  /**
   * Register the phone number (also applies an approved display name change).
   * For the Embedded Signup flow with retries, see `registerPhoneNumber()` in the signup helpers.
   */
  async registerPhoneNumber(pin: string, options?: RequestOptions): Promise<SuccessResponse> {
    return this.http.request<SuccessResponse>(
      {
        method: "POST",
        path: `/${this.phoneId}/register`,
        json: { messaging_product: "whatsapp", pin },
      },
      options,
    );
  }

  // ─── Messaging Limit ───────────────────────────────────────

  /**
   * Get the current messaging limit tier.
   * Returns a tier string like "TIER_250", "TIER_1K", "TIER_10K", etc.
   */
  async getMessagingLimit(options?: RequestOptions): Promise<string> {
    const response = await this.http.request<{ whatsapp_business_manager_messaging_limit?: string }>(
      {
        method: "GET",
        path: `/${this.phoneId}`,
        query: { fields: "whatsapp_business_manager_messaging_limit" },
      },
      options,
    );
    return response.whatsapp_business_manager_messaging_limit ?? "TIER_250";
  }

  // ─── Internal Helpers ────────────────────────────────────────

  /**
   * Send a message via the messages endpoint
   */
  private async send(
    to: string,
    payload: Record<string, unknown>,
    options?: SendOptions,
  ): Promise<SendMessageResponse> {
    return this.http.request<SendMessageResponse>(
      {
        method: "POST",
        path: `/${this.phoneId}/messages`,
        json: {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          ...payload,
          ...(options?.replyTo && { context: { message_id: options.replyTo } }),
        },
      },
      options,
    );
  }

  /**
   * Yield every item across all pages, following Meta's `after` cursor
   */
  private async *paginate<T>(
    path: string,
    query: Record<string, string | number | undefined>,
    options?: RequestOptions & { maxPages?: number },
  ): AsyncGenerator<T> {
    let after: string | undefined;
    let pages = 0;

    do {
      const page = await this.http.request<Paged<T>>(
        { method: "GET", path, query: { ...query, after } },
        options,
      );
      for (const item of page.data ?? []) yield item;
      pages++;
      // Meta only includes `next` when there is another page
      after = page.paging?.next ? page.paging.cursors?.after : undefined;
    } while (after && (options?.maxPages === undefined || pages < options.maxPages));
  }

  private requireWabaId(): string {
    if (!this.wabaId) {
      throw new TypeError("WhatsAppClient: `wabaId` is required for template operations. Pass it in the config.");
    }
    return this.wabaId;
  }
}

/**
 * Build the media-specific object for the send message payload
 */
function buildMediaObject(media: MediaPayload): Record<string, string | boolean> {
  const base: Record<string, string | boolean> = media.id ? { id: media.id } : { link: media.url! };

  // Caption not supported for audio and sticker
  const supportsCaption: MediaType[] = ["image", "video", "document"];
  if (media.caption && supportsCaption.includes(media.type)) {
    base.caption = media.caption;
  }

  if (media.type === "document" && media.filename) {
    base.filename = media.filename;
  }

  // Voice messages (WhatsApp voice note style)
  if (media.type === "audio" && media.voice) {
    base.voice = true;
  }

  return base;
}

function lookupComponents(
  components: BulkSendOptions["components"],
  phone: string,
): TemplateSendComponent[] | undefined {
  if (!components) return undefined;
  return components instanceof Map ? components.get(phone) : components[phone];
}

function toBlob(file: BinaryInput, mimeType: string): Blob {
  if (file instanceof Blob) return file;
  // Copy into a plain Uint8Array — Node Buffers may be views over a larger pool
  return new Blob([new Uint8Array(file)], { type: mimeType });
}
