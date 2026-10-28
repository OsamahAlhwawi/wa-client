/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { RequestOptions, RetryOptions, WhatsAppLogger } from "./http.js";

// ─── Configuration ───────────────────────────────────────────────

export interface WhatsAppConfig {
  /** WhatsApp Cloud API access token */
  token: string;
  /** Phone Number ID (used in API calls) */
  phoneId: string;
  /** WhatsApp Business Account ID — required for template operations only */
  wabaId?: string;
  /** Graph API version (default: v25.0) */
  apiVersion?: string;
  /** Graph API base URL (default: https://graph.facebook.com) */
  baseUrl?: string;
  /** Request timeout in ms (default: 30000). `0` disables it. */
  timeoutMs?: number;
  /** Custom fetch implementation (proxies, testing, older runtimes) */
  fetch?: typeof fetch;
  /** Retry policy for rate limits and transient GET failures. `false` disables retries. */
  retry?: RetryOptions | false;
  /** Optional logger for request/retry diagnostics. Silent by default. */
  logger?: WhatsAppLogger;
}

// ─── Common ──────────────────────────────────────────────────────

export interface SendMessageResponse {
  messaging_product: "whatsapp";
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string; message_status?: "accepted" | "held_for_quality_assessment" | "paused" }>;
}

export interface SuccessResponse {
  success: boolean;
}

export interface SendOptions extends RequestOptions {
  /** WAMID of the message to reply to (shows as a quoted reply) */
  replyTo?: string;
}

// ─── Media Types ─────────────────────────────────────────────────

export type MediaType = "image" | "video" | "audio" | "document" | "sticker";

interface MediaPayloadBase {
  type: MediaType;
  /** Caption (not supported for audio/sticker) */
  caption?: string;
  /** Shown as the file name (document type only) */
  filename?: string;
  /** Set to true for voice messages (audio type only, requires OGG/OPUS) */
  voice?: boolean;
}

/** Send media either from a public URL or from a previously uploaded media ID. */
export type MediaPayload =
  | (MediaPayloadBase & { url: string; id?: never })
  | (MediaPayloadBase & { id: string; url?: never });

/** Anything that can be uploaded: Blob/File, ArrayBuffer, Uint8Array or Node.js Buffer. */
export type BinaryInput = Blob | ArrayBuffer | Uint8Array;

export interface UploadMediaResponse {
  id: string;
}

export interface ResumableUploadResponse {
  /** Asset handle for use in template headers */
  handle: string;
}

export interface MediaInfo {
  messaging_product: "whatsapp";
  /** Temporary download URL — valid for about 5 minutes and requires the access token */
  url: string;
  mime_type: string;
  sha256: string;
  file_size: number;
  id: string;
}

export interface DownloadedMedia {
  data: Uint8Array;
  mimeType: string;
  fileSize: number;
  sha256: string;
}

// ─── Location & Contacts ─────────────────────────────────────────

export interface LocationPayload {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface ContactCard {
  name: {
    formatted_name: string;
    first_name?: string;
    last_name?: string;
    middle_name?: string;
    suffix?: string;
    prefix?: string;
  };
  phones?: Array<{ phone?: string; type?: "CELL" | "MAIN" | "IPHONE" | "HOME" | "WORK"; wa_id?: string }>;
  emails?: Array<{ email?: string; type?: "HOME" | "WORK" }>;
  urls?: Array<{ url?: string; type?: "HOME" | "WORK" }>;
  addresses?: Array<{
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    country_code?: string;
    type?: "HOME" | "WORK";
  }>;
  org?: { company?: string; department?: string; title?: string };
  birthday?: string;
}

// ─── Interactive Messages ────────────────────────────────────────

export type InteractiveHeader =
  | { type: "text"; text: string }
  | { type: "image"; image: { link: string } | { id: string } }
  | { type: "video"; video: { link: string } | { id: string } }
  | { type: "document"; document: ({ link: string } | { id: string }) & { filename?: string } };

export interface InteractiveButtonsPayload {
  /** Message body (max 1024 chars) */
  body: string;
  /** 1–3 reply buttons. Titles max 20 chars, IDs max 256 chars. */
  buttons: Array<{ id: string; title: string }>;
  header?: InteractiveHeader;
  footer?: string;
}

export interface InteractiveListPayload {
  /** Message body (max 4096 chars) */
  body: string;
  /** Label of the button that opens the list (max 20 chars) */
  buttonText: string;
  /** 1–10 sections, max 10 rows in total. Row titles max 24 chars, descriptions max 72. */
  sections: Array<{
    title?: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
  /** Lists only support text headers */
  header?: string;
  footer?: string;
}

export interface CtaUrlPayload {
  body: string;
  /** Button label (max 20 chars) */
  buttonText: string;
  url: string;
  header?: InteractiveHeader;
  footer?: string;
}

// ─── Template Types ──────────────────────────────────────────────

export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

export type TemplateStatus =
  | "APPROVED"
  | "PENDING"
  | "REJECTED"
  | "PAUSED"
  | "DISABLED"
  | "IN_APPEAL"
  | "PENDING_DELETION"
  | "DELETED"
  | "LIMIT_EXCEEDED";

export type TemplateHeaderFormat = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION" | "NONE";

export type TemplateButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE";

export interface TemplateButton {
  type: TemplateButtonType;
  text: string;
  url?: string;
  phone_number?: string;
  example?: string[];
}

export interface TemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: TemplateHeaderFormat;
  text?: string;
  example?: {
    header_handle?: string[];
    header_text?: string[];
    body_text?: string[][];
  };
  buttons?: TemplateButton[];
}

export interface TemplateQualityScore {
  score: "GREEN" | "YELLOW" | "RED" | "UNKNOWN";
}

export interface Template {
  id: string;
  name: string;
  language: string;
  status: TemplateStatus;
  category: TemplateCategory;
  components: TemplateComponent[];
  quality_score?: TemplateQualityScore;
}

export interface CreateTemplatePayload {
  name: string;
  language: string;
  category: TemplateCategory;
  components: TemplateComponent[];
  /** Variable style: `{{1}}` (positional, default) or `{{order_id}}` (named) */
  parameter_format?: "positional" | "named";
}

export interface CreateTemplateResponse {
  id: string;
  status: TemplateStatus;
  category: TemplateCategory;
}

export interface GetTemplatesOptions extends RequestOptions {
  /** Only return templates with these statuses */
  status?: TemplateStatus[];
  category?: TemplateCategory;
  /** Filter by template name */
  name?: string;
  language?: string;
  /** Graph API fields to request (default: name,language,status,category,components,quality_score) */
  fields?: string[];
  /** Page size requested from Meta (default 100) */
  pageSize?: number;
  /** Stop after this many pages (default: no limit) */
  maxPages?: number;
}

// ─── Send Template Types ─────────────────────────────────────────

export interface TemplateHeaderParam {
  type: "image" | "video" | "document" | "text" | "location";
  image?: { link: string } | { id: string };
  video?: { link: string } | { id: string };
  document?: ({ link: string } | { id: string }) & { filename?: string };
  text?: string;
  location?: LocationPayload;
}

export interface TemplateBodyParam {
  type: "text" | "currency" | "date_time";
  text?: string;
  /** Variable name, for templates created with `parameter_format: "named"` */
  parameter_name?: string;
  currency?: { fallback_value: string; code: string; amount_1000: number };
  date_time?: { fallback_value: string };
}

export interface TemplateButtonParam {
  type: "payload" | "text" | "coupon_code";
  payload?: string;
  text?: string;
  coupon_code?: string;
}

export interface TemplateSendComponent {
  type: "header" | "body" | "button";
  parameters?: Array<TemplateHeaderParam | TemplateBodyParam | TemplateButtonParam>;
  sub_type?: "quick_reply" | "url" | "copy_code";
  index?: string;
}

export interface SendTemplatePayload {
  name: string;
  language: string;
  components?: TemplateSendComponent[];
}

// ─── Template Analytics ──────────────────────────────────────────

export interface TemplateAnalyticsRequest {
  templateIds: string[];
  start: Date;
  end: Date;
  granularity?: "DAILY" | "HALF_HOUR";
}

export interface TemplateAnalyticsDataPoint {
  start: number;
  end: number;
  sent: number;
  delivered: number;
  read: number;
  clicked?: Array<{ type: string; button_content: string; count: number }>;
  cost?: Array<{ type: string; value?: number }>;
}

export interface TemplateAnalyticsResponse {
  data: Array<{
    granularity: string;
    product_type?: string;
    data_points: Array<TemplateAnalyticsDataPoint & { template_id: string }>;
  }>;
  paging?: Paging;
}

// ─── Bulk Send Types ─────────────────────────────────────────────

export interface BulkSendItemResult {
  phone: string;
  success: boolean;
  wamid?: string;
  error?: string;
  /** Graph API error code, when available (e.g. 131026 = not a WhatsApp user) */
  errorCode?: number;
}

export interface BulkSendResult {
  total: number;
  successful: number;
  failed: number;
  /** One entry per recipient, in the same order as the input */
  results: BulkSendItemResult[];
}

export interface BulkSendOptions extends RequestOptions {
  /** Max requests in flight at once (default 20) */
  concurrency?: number;
  /** Per-recipient components (personalized variables), keyed by phone number */
  components?: Map<string, TemplateSendComponent[]> | Record<string, TemplateSendComponent[]>;
  /** Called after each recipient finishes — useful for progress bars */
  onProgress?: (result: BulkSendItemResult, completed: number, total: number) => void;
}

// ─── Business Profile Types ─────────────────────────────────────

export type BusinessVertical =
  | "ALCOHOL"
  | "APPAREL"
  | "AUTO"
  | "BEAUTY"
  | "EDU"
  | "ENTERTAIN"
  | "EVENT_PLAN"
  | "FINANCE"
  | "GOVT"
  | "GROCERY"
  | "HEALTH"
  | "HOTEL"
  | "NONPROFIT"
  | "ONLINE_GAMBLING"
  | "OTC_DRUGS"
  | "OTHER"
  | "PHYSICAL_GAMBLING"
  | "PROF_SERVICES"
  | "RESTAURANT"
  | "RETAIL"
  | "TRAVEL";

export interface BusinessProfile {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  profile_picture_url?: string;
  websites?: string[];
  vertical?: BusinessVertical;
}

export interface UpdateBusinessProfilePayload {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  websites?: string[];
  vertical?: BusinessVertical;
  /** Handle returned by `uploadMediaResumable()` */
  profile_picture_handle?: string;
}

// ─── QR Code Types ──────────────────────────────────────────

export interface QRCode {
  code: string;
  prefilled_message: string;
  deep_link_url?: string;
  qr_image_url?: string;
}

// ─── Display Name Types ─────────────────────────────────────

export interface DisplayNameInfo {
  verified_name: string;
  name_status: string;
  display_phone_number?: string;
  new_display_name?: string;
  new_name_status?: string;
  quality_rating?: "GREEN" | "YELLOW" | "RED" | "NA";
  id: string;
}

// ─── Pagination ─────────────────────────────────────────────

export interface Paging {
  cursors?: { before?: string; after?: string };
  next?: string;
  previous?: string;
}

export interface Paged<T> {
  data: T[];
  paging?: Paging;
}
