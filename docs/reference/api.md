# API Reference

`opts` is always optional and accepts `{ signal?: AbortSignal; timeoutMs?: number }`. Send methods also accept `replyTo?: string`.

## `new WhatsAppClient(config)`

See [Configuration](/guide/configuration).

## Messages

| Method | Returns | Notes |
| --- | --- | --- |
| `sendText(to, body, opts?)` | `SendMessageResponse` | `opts.previewUrl` shows link previews |
| `sendMedia(to, media, opts?)` | `SendMessageResponse` | `media`: `{ type, url \| id, caption?, filename?, voice? }` |
| `sendLocation(to, location, opts?)` | `SendMessageResponse` | `{ latitude, longitude, name?, address? }` |
| `sendContacts(to, contacts, opts?)` | `SendMessageResponse` | `ContactCard[]` |
| `sendReaction(to, messageId, emoji, opts?)` | `SendMessageResponse` | `""` removes the reaction |
| `sendInteractiveButtons(to, payload, opts?)` | `SendMessageResponse` | `{ body, buttons[≤3], header?, footer? }` |
| `sendInteractiveList(to, payload, opts?)` | `SendMessageResponse` | `{ body, buttonText, sections, header?, footer? }` |
| `sendCtaUrl(to, payload, opts?)` | `SendMessageResponse` | `{ body, buttonText, url, header?, footer? }` |
| `sendTemplate(to, template, opts?)` | `SendMessageResponse` | `{ name, language, components? }` |
| `sendTemplateBulk(recipients, template, opts?)` | `BulkSendResult` | `opts`: `concurrency`, `components`, `onProgress`, `signal` |
| `markAsRead(messageId, opts?)` | `{ success }` | `opts.typingIndicator` |
| `sendRaw(to, payload, opts?)` | `SendMessageResponse` | Escape hatch for any message type |

```ts
interface SendMessageResponse {
  messaging_product: "whatsapp";
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string; message_status?: string }>;
}
```

## Media

| Method | Returns | Notes |
| --- | --- | --- |
| `uploadMedia(file, mimeType, filename, opts?)` | `{ id }` | `file`: `Blob \| ArrayBuffer \| Uint8Array \| Buffer` |
| `uploadMediaResumable(file, mimeType, filename, opts?)` | `{ handle }` | For template headers / profile pictures |
| `getMediaUrl(mediaId, opts?)` | `MediaInfo` | `{ url, mime_type, sha256, file_size, id }`. URL expires in ~5 min. |
| `downloadMedia(mediaId, opts?)` | `DownloadedMedia` | `{ data: Uint8Array, mimeType, fileSize, sha256 }` |
| `deleteMedia(mediaId, opts?)` | `{ success }` | |

## Templates

Requires `wabaId` in the config.

| Method | Returns | Notes |
| --- | --- | --- |
| `getTemplates(opts?)` | `Template[]` | Follows all pages. `opts`: `status`, `category`, `name`, `language`, `fields`, `pageSize`, `maxPages` |
| `iterateTemplates(opts?)` | `AsyncGenerator<Template>` | Same options, streams page by page |
| `getTemplate(name, language?, opts?)` | `Template \| null` | Exact name match |
| `getTemplateButtons(opts?)` | `{ templateName, buttons }[]` | QUICK_REPLY buttons of approved/pending templates |
| `createTemplate(payload, opts?)` | `{ id, status, category }` | `parameter_format` defaults to `"positional"` |
| `editTemplate(templateId, payload, opts?)` | `{ success }` | Once per 24h |
| `deleteTemplate(name, opts?)` | `{ success }` | `opts.templateId` deletes a single language |
| `getTemplateAnalytics(params, opts?)` | `TemplateAnalyticsResponse` | `{ templateIds, start, end, granularity? }` |
| `enableTemplateInsights(opts?)` | `{ id }` | |

## Phone number & profile

| Method | Returns |
| --- | --- |
| `getBusinessProfile(opts?)` | `BusinessProfile` |
| `updateBusinessProfile(payload, opts?)` | `{ success }` |
| `getDisplayName(opts?)` | `DisplayNameInfo` |
| `updateDisplayName(newName, opts?)` | `{ success }` |
| `registerPhoneNumber(pin, opts?)` | `{ success }` |
| `getMessagingLimit(opts?)` | `string`, e.g. `"TIER_1K"` |

## QR codes

| Method | Returns |
| --- | --- |
| `getQRCodes(opts?)` | `QRCode[]` |
| `getQRCodeImage(code, opts?)` | `string \| null` (PNG URL) |
| `createQRCode(prefilledMessage, opts?)` | `QRCode` |
| `updateQRCode(code, prefilledMessage, opts?)` | `QRCode` |
| `deleteQRCode(code, opts?)` | `{ success }` |

## Webhooks

| Function | Returns |
| --- | --- |
| `verifyWebhookSignature(rawBody, signatureHeader, appSecret)` | `Promise<boolean>` |
| `verifyWebhookChallenge(query, verifyToken)` | `string \| null` |
| `parseWebhook(payload)` | `WebhookEvent[]` |

Exported types: `WebhookPayload`, `WebhookEvent`, `MessageEvent`, `StatusEvent`, `ErrorEvent`, `OtherEvent`, `IncomingMessage` (and each variant: `TextMessage`, `ImageMessage`, `InteractiveMessage`, `ButtonMessage`, `ReactionMessage`, ...), `MessageStatusUpdate`, `WebhookContact`, `WebhookMetadata`, `WebhookError`.

## Embedded Signup

| Function | Returns |
| --- | --- |
| `exchangeCodeForToken({ appId, appSecret, code, redirectUri? }, opts?)` | `{ accessToken, tokenType?, expiresIn? }` |
| `subscribeAppToWaba(wabaId, token, opts?)` | `{ success }` |
| `getWabaPhoneNumbers(wabaId, token, opts?)` | `WabaPhoneNumber[]` |
| `registerPhoneNumber(phoneId, token, pin, opts?)` | `{ success: true, attempts }` |
| `initiateSmbSync(phoneId, token, syncType, opts?)` | `{ requestId?, alreadyRequested }` |
| `generatePin()` | `string` (6 digits) |

## Errors

`WhatsAppError`: see [Error Handling](/guide/errors).

## Constants

| Export | Value |
| --- | --- |
| `DEFAULT_API_VERSION` | `"v25.0"` |
| `RATE_LIMIT_CODES` | `Set { 4, 80007, 130429, 131056 }` |
