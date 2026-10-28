/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export { WhatsAppClient } from "./client.js";
export { WhatsAppError } from "./errors.js";
export type { WhatsAppApiError, WhatsAppErrorKind, WhatsAppErrorInit } from "./errors.js";
export type { RequestOptions, RetryOptions, WhatsAppLogger } from "./http.js";
export { DEFAULT_API_VERSION, RATE_LIMIT_CODES } from "./constants.js";
export type {
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
  InteractiveHeader,
  InteractiveButtonsPayload,
  InteractiveListPayload,
  CtaUrlPayload,
  Template,
  TemplateStatus,
  TemplateCategory,
  TemplateHeaderFormat,
  TemplateButtonType,
  TemplateComponent,
  TemplateButton,
  TemplateQualityScore,
  GetTemplatesOptions,
  CreateTemplatePayload,
  CreateTemplateResponse,
  SendTemplatePayload,
  TemplateSendComponent,
  TemplateHeaderParam,
  TemplateBodyParam,
  TemplateButtonParam,
  TemplateAnalyticsRequest,
  TemplateAnalyticsDataPoint,
  TemplateAnalyticsResponse,
  BulkSendOptions,
  BulkSendItemResult,
  BulkSendResult,
  BusinessVertical,
  BusinessProfile,
  UpdateBusinessProfilePayload,
  QRCode,
  DisplayNameInfo,
  Paging,
  Paged,
} from "./types.js";

// Webhooks
export * from "./webhook/index.js";

// Embedded Signup
export {
  generatePin,
  exchangeCodeForToken,
  subscribeAppToWaba,
  getWabaPhoneNumbers,
  registerPhoneNumber,
  initiateSmbSync,
} from "./signup.js";
export type {
  GraphOptions,
  ExchangeCodeParams,
  ExchangeCodeResult,
  WabaPhoneNumber,
  RegisterAttempt,
  RegisterOptions,
} from "./signup.js";
