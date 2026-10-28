/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Types for the payload Meta POSTs to your webhook URL.
// https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components

export interface WebhookPayload {
  object: "whatsapp_business_account";
  entry: WebhookEntry[];
}

export interface WebhookEntry {
  /** WhatsApp Business Account ID */
  id: string;
  /** Unix seconds (present on some event types) */
  time?: number;
  changes: WebhookChange[];
}

export type WebhookChange =
  | { field: "messages"; value: MessagesValue }
  | { field: string; value: Record<string, unknown> };

export interface WebhookMetadata {
  display_phone_number: string;
  phone_number_id: string;
}

export interface WebhookContact {
  wa_id: string;
  profile?: { name?: string };
  /** Business-scoped user ID (for users who adopted usernames) */
  user_id?: string;
}

export interface WebhookError {
  code: number;
  title: string;
  message?: string;
  error_data?: { details?: string };
  href?: string;
}

export interface MessagesValue {
  messaging_product: "whatsapp";
  metadata: WebhookMetadata;
  contacts?: WebhookContact[];
  messages?: IncomingMessage[];
  statuses?: MessageStatusUpdate[];
  errors?: WebhookError[];
}

// ─── Incoming messages ───────────────────────────────────────────

export interface WebhookMediaObject {
  id: string;
  mime_type: string;
  sha256?: string;
  caption?: string;
}

interface IncomingMessageBase {
  /** Sender's WhatsApp ID (phone number without +) */
  from: string;
  /** WAMID — use it for replies, reactions and `markAsRead()` */
  id: string;
  /** Unix seconds as a string */
  timestamp: string;
  /** Present when the user replied to / forwarded a message */
  context?: {
    from?: string;
    id?: string;
    forwarded?: boolean;
    frequently_forwarded?: boolean;
    referred_product?: { catalog_id: string; product_retailer_id: string };
  };
  /** Present when the user came from a Click-to-WhatsApp ad */
  referral?: {
    source_url: string;
    source_type: "ad" | "post";
    source_id: string;
    headline?: string;
    body?: string;
    media_type?: "image" | "video";
    image_url?: string;
    video_url?: string;
    thumbnail_url?: string;
    ctwa_clid?: string;
  };
  errors?: WebhookError[];
}

export interface TextMessage extends IncomingMessageBase {
  type: "text";
  text: { body: string };
}

export interface ImageMessage extends IncomingMessageBase {
  type: "image";
  image: WebhookMediaObject;
}

export interface VideoMessage extends IncomingMessageBase {
  type: "video";
  video: WebhookMediaObject;
}

export interface AudioMessage extends IncomingMessageBase {
  type: "audio";
  audio: WebhookMediaObject & { voice?: boolean };
}

export interface DocumentMessage extends IncomingMessageBase {
  type: "document";
  document: WebhookMediaObject & { filename?: string };
}

export interface StickerMessage extends IncomingMessageBase {
  type: "sticker";
  sticker: WebhookMediaObject & { animated?: boolean };
}

export interface LocationMessage extends IncomingMessageBase {
  type: "location";
  location: { latitude: number; longitude: number; name?: string; address?: string; url?: string };
}

export interface ContactsMessage extends IncomingMessageBase {
  type: "contacts";
  contacts: Array<{
    name: { formatted_name: string; first_name?: string; last_name?: string };
    phones?: Array<{ phone?: string; wa_id?: string; type?: string }>;
    emails?: Array<{ email?: string; type?: string }>;
    [key: string]: unknown;
  }>;
}

export interface InteractiveMessage extends IncomingMessageBase {
  type: "interactive";
  interactive:
    | { type: "button_reply"; button_reply: { id: string; title: string } }
    | { type: "list_reply"; list_reply: { id: string; title: string; description?: string } }
    | { type: "nfm_reply"; nfm_reply: { name?: string; body?: string; response_json: string } };
}

/** A user tapped a quick-reply button on a template message */
export interface ButtonMessage extends IncomingMessageBase {
  type: "button";
  button: { text: string; payload: string };
}

export interface ReactionMessage extends IncomingMessageBase {
  type: "reaction";
  /** `emoji` is missing when the user removed their reaction */
  reaction: { message_id: string; emoji?: string };
}

export interface OrderMessage extends IncomingMessageBase {
  type: "order";
  order: {
    catalog_id: string;
    text?: string;
    product_items: Array<{ product_retailer_id: string; quantity: number; item_price: number; currency: string }>;
  };
}

export interface SystemMessage extends IncomingMessageBase {
  type: "system";
  system: { body: string; type: string; wa_id?: string; new_wa_id?: string };
}

export interface RequestWelcomeMessage extends IncomingMessageBase {
  type: "request_welcome";
}

export interface UnsupportedMessage extends IncomingMessageBase {
  type: "unsupported" | "unknown";
}

export type IncomingMessage =
  | TextMessage
  | ImageMessage
  | VideoMessage
  | AudioMessage
  | DocumentMessage
  | StickerMessage
  | LocationMessage
  | ContactsMessage
  | InteractiveMessage
  | ButtonMessage
  | ReactionMessage
  | OrderMessage
  | SystemMessage
  | RequestWelcomeMessage
  | UnsupportedMessage;

export type IncomingMessageType = IncomingMessage["type"];

// ─── Status updates ──────────────────────────────────────────────

export interface MessageStatusUpdate {
  /** WAMID of the message you sent */
  id: string;
  status: "sent" | "delivered" | "read" | "failed" | "deleted";
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    expiration_timestamp?: string;
    origin: { type: "authentication" | "marketing" | "utility" | "service" | "referral_conversion" | string };
  };
  pricing?: {
    billable: boolean;
    pricing_model: "CBP" | "PMP" | string;
    category: string;
    type?: string;
  };
  /** Set when `status` is "failed" */
  errors?: WebhookError[];
  /** Your `biz_opaque_callback_data`, echoed back */
  biz_opaque_callback_data?: string;
}

// ─── Parsed events ───────────────────────────────────────────────

interface EventBase {
  /** WhatsApp Business Account ID (entry.id) */
  wabaId: string;
}

export interface MessageEvent extends EventBase {
  type: "message";
  message: IncomingMessage;
  /** Sender profile (name) when Meta includes it */
  contact?: WebhookContact;
  metadata: WebhookMetadata;
}

export interface StatusEvent extends EventBase {
  type: "status";
  status: MessageStatusUpdate;
  metadata: WebhookMetadata;
}

export interface ErrorEvent extends EventBase {
  type: "error";
  error: WebhookError;
  metadata: WebhookMetadata;
}

/** Any other webhook field (account_update, message_template_status_update, ...) */
export interface OtherEvent extends EventBase {
  type: "other";
  field: string;
  value: Record<string, unknown>;
}

export type WebhookEvent = MessageEvent | StatusEvent | ErrorEvent | OtherEvent;
