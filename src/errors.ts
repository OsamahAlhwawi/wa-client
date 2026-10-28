/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RATE_LIMIT_CODES } from "./constants.js";

/** The `error` object returned by the Graph API. */
export interface WhatsAppApiError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  error_data?: { messaging_product?: string; details?: string };
  is_transient?: boolean;
  fbtrace_id?: string;
}

/**
 * Where the failure came from:
 * - `api`      Meta returned a structured error (`code`, `subcode`, ... are set)
 * - `http`     Non-2xx or unparsable response without a Graph API error body (e.g. a 502 HTML page)
 * - `network`  The request never got a response (DNS, connection reset, ...)
 * - `timeout`  The request exceeded `timeoutMs`
 * - `aborted`  The caller's `AbortSignal` fired
 */
export type WhatsAppErrorKind = "api" | "http" | "network" | "timeout" | "aborted";

export interface WhatsAppErrorInit {
  kind: WhatsAppErrorKind;
  status?: number;
  code?: number;
  subcode?: number;
  type?: string;
  userTitle?: string;
  userMsg?: string;
  details?: string;
  isTransient?: boolean;
  fbtraceId?: string;
  body?: unknown;
  cause?: unknown;
}

export class WhatsAppError extends Error {
  readonly kind: WhatsAppErrorKind;
  /** HTTP status code, or `0` when no response was received. */
  readonly status: number;
  /** Graph API error code (e.g. `131047` = re-engagement window closed). */
  readonly code?: number;
  readonly subcode?: number;
  /** Graph API error type (e.g. `OAuthException`). */
  readonly type?: string;
  readonly userTitle?: string;
  readonly userMsg?: string;
  /** `error_data.details` — usually the most specific explanation Meta gives. */
  readonly details?: string;
  readonly isTransient?: boolean;
  readonly fbtraceId?: string;
  /** Raw response body (parsed JSON, or a text snippet for non-JSON responses). */
  readonly body?: unknown;

  constructor(message: string, init: WhatsAppErrorInit) {
    super(message, init.cause !== undefined ? { cause: init.cause } : undefined);
    this.name = "WhatsAppError";
    this.kind = init.kind;
    this.status = init.status ?? 0;
    this.code = init.code;
    this.subcode = init.subcode;
    this.type = init.type;
    this.userTitle = init.userTitle;
    this.userMsg = init.userMsg;
    this.details = init.details;
    this.isTransient = init.isTransient;
    this.fbtraceId = init.fbtraceId;
    this.body = init.body;
  }

  /** Build an error from a Graph API `error` object. */
  static fromApiError(error: WhatsAppApiError, status: number, body?: unknown): WhatsAppError {
    // Prefer the human-readable error_user_msg over the generic message
    return new WhatsAppError(error.error_user_msg || error.message, {
      kind: "api",
      status,
      code: error.code,
      subcode: error.error_subcode,
      type: error.type,
      userTitle: error.error_user_title,
      userMsg: error.error_user_msg,
      details: error.error_data?.details,
      isTransient: error.is_transient,
      fbtraceId: error.fbtrace_id,
      body,
    });
  }

  /** True when Meta asked us to slow down (safe to retry after a delay). */
  get isRateLimit(): boolean {
    return this.status === 429 || (this.code !== undefined && RATE_LIMIT_CODES.has(this.code));
  }
}
