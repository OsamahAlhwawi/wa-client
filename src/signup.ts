/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Helpers for Meta's Embedded Signup flow — onboarding a customer's WhatsApp
// Business Account into your app (Tech Provider / Solution Partner use case).
// https://developers.facebook.com/docs/whatsapp/embedded-signup

import { WhatsAppError } from "./errors.js";
import { HttpClient, type HttpClientOptions, type RequestOptions } from "./http.js";
import type { Paged, SuccessResponse } from "./types.js";

/** Graph API options shared by all Embedded Signup helpers. */
export type GraphOptions = Omit<HttpClientOptions, "token"> & RequestOptions;

export interface ExchangeCodeParams {
  appId: string;
  appSecret: string;
  /** The `code` returned by the Embedded Signup popup (valid for ~30 seconds) */
  code: string;
  redirectUri?: string;
}

export interface ExchangeCodeResult {
  /** Business Integration System User access token for the customer's WABA */
  accessToken: string;
  tokenType?: string;
  expiresIn?: number;
}

export interface WabaPhoneNumber {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
}

export interface RegisterAttempt {
  /** HTTP status, or 0 when no response was received */
  status: number;
  body: unknown;
}

export interface RegisterOptions extends GraphOptions {
  /** Total attempts (default 3) */
  attempts?: number;
  /** Timeout per attempt — registration can be slow (default 60s) */
  attemptTimeoutMs?: number;
  /** Base delay between attempts; grows linearly (default 2s) */
  backoffMs?: number;
}

const DEFAULT_REGISTER_ATTEMPTS = 3;
const DEFAULT_REGISTER_TIMEOUT_MS = 60_000;
const DEFAULT_REGISTER_BACKOFF_MS = 2_000;
const PIN_RANGE = 900_000;

/**
 * Generate a random 6-digit two-step verification PIN for `registerPhoneNumber()`
 */
export function generatePin(): string {
  // Rejection sampling avoids modulo bias
  const limit = Math.floor(0x1_0000_0000 / PIN_RANGE) * PIN_RANGE;
  const buf = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(buf);
  } while (buf[0]! >= limit);
  return (100_000 + (buf[0]! % PIN_RANGE)).toString();
}

/**
 * Exchange the short-lived authorization code from Embedded Signup for a
 * long-lived business integration access token.
 *
 * GET /oauth/access_token
 */
export async function exchangeCodeForToken(
  params: ExchangeCodeParams,
  options?: GraphOptions,
): Promise<ExchangeCodeResult> {
  const data = await graph(undefined, options).request<{
    access_token?: string;
    token_type?: string;
    expires_in?: number;
  }>(
    {
      method: "GET",
      path: "/oauth/access_token",
      auth: "none",
      query: {
        client_id: params.appId,
        client_secret: params.appSecret,
        code: params.code,
        redirect_uri: params.redirectUri,
      },
    },
    options,
  );

  if (!data.access_token) {
    throw new WhatsAppError("Meta did not return an access token for this code.", {
      kind: "api",
      status: 200,
      body: data,
    });
  }

  return {
    accessToken: data.access_token,
    ...(data.token_type && { tokenType: data.token_type }),
    ...(data.expires_in !== undefined && { expiresIn: data.expires_in }),
  };
}

/**
 * Subscribe your app to a WABA's webhooks — required after Embedded Signup,
 * otherwise incoming messages never reach your webhook URL.
 *
 * POST /{waba_id}/subscribed_apps
 */
export async function subscribeAppToWaba(
  wabaId: string,
  accessToken: string,
  options?: GraphOptions & { overrideCallbackUri?: string; verifyToken?: string },
): Promise<SuccessResponse> {
  const data = await graph(accessToken, options).request<SuccessResponse>(
    {
      method: "POST",
      path: `/${encodeURIComponent(wabaId)}/subscribed_apps`,
      ...(options?.overrideCallbackUri && {
        json: { override_callback_uri: options.overrideCallbackUri, verify_token: options.verifyToken },
      }),
    },
    options,
  );

  if (!data.success) {
    throw new WhatsAppError("Failed to subscribe the app to the WhatsApp Business Account.", {
      kind: "api",
      status: 200,
      body: data,
    });
  }
  return data;
}

/**
 * List the phone numbers on a WABA. Useful in the coexistence flow, where
 * Embedded Signup returns only the WABA ID.
 *
 * GET /{waba_id}/phone_numbers
 */
export async function getWabaPhoneNumbers(
  wabaId: string,
  accessToken: string,
  options?: GraphOptions,
): Promise<WabaPhoneNumber[]> {
  const data = await graph(accessToken, options).request<Paged<WabaPhoneNumber>>(
    {
      method: "GET",
      path: `/${encodeURIComponent(wabaId)}/phone_numbers`,
      query: { fields: "id,display_phone_number,verified_name,quality_rating,code_verification_status" },
    },
    options,
  );
  return data.data ?? [];
}

/**
 * Register a phone number with the Cloud API, retrying on failure.
 * Success requires HTTP 2xx **and** `success: true` in the body.
 *
 * POST /{phone_id}/register
 *
 * @throws WhatsAppError with `body.attempts` listing every raw response
 */
export async function registerPhoneNumber(
  phoneId: string,
  accessToken: string,
  pin: string,
  options?: RegisterOptions,
): Promise<{ success: true; attempts: RegisterAttempt[] }> {
  const maxAttempts = Math.max(1, options?.attempts ?? DEFAULT_REGISTER_ATTEMPTS);
  const backoffMs = options?.backoffMs ?? DEFAULT_REGISTER_BACKOFF_MS;
  // This function owns the retry loop — disable the HTTP layer's own retries
  const http = graph(accessToken, { ...options, retry: false });
  const attempts: RegisterAttempt[] = [];
  let lastError: WhatsAppError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const body = await http.request<{ success?: boolean }>(
        {
          method: "POST",
          path: `/${encodeURIComponent(phoneId)}/register`,
          json: { messaging_product: "whatsapp", pin },
        },
        { signal: options?.signal, timeoutMs: options?.attemptTimeoutMs ?? DEFAULT_REGISTER_TIMEOUT_MS },
      );
      attempts.push({ status: 200, body });
      if (body.success === true) return { success: true, attempts };

      lastError = new WhatsAppError("Meta did not confirm the registration (missing `success: true`).", {
        kind: "api",
        status: 200,
        body,
      });
    } catch (err) {
      if (!(err instanceof WhatsAppError) || err.kind === "aborted") throw err;
      attempts.push({ status: err.status, body: err.body ?? { error: err.message } });
      lastError = err;
    }

    if (attempt < maxAttempts) await delay(backoffMs * attempt);
  }

  throw new WhatsAppError(
    `Phone number registration failed after ${maxAttempts} attempt(s): ${lastError?.message ?? "unknown error"}`,
    {
      kind: lastError?.kind ?? "api",
      status: lastError?.status,
      code: lastError?.code,
      subcode: lastError?.subcode,
      type: lastError?.type,
      details: lastError?.details,
      fbtraceId: lastError?.fbtraceId,
      body: { attempts },
      cause: lastError,
    },
  );
}

/**
 * Trigger a one-time WhatsApp Business App data sync (coexistence onboarding).
 * - `smb_app_state_sync` → contacts dump
 * - `history`            → up to 6 months of conversation history
 *
 * Can only be triggered once per phone number; repeat calls resolve with
 * `alreadyRequested: true` instead of throwing.
 *
 * POST /{phone_id}/smb_app_data
 */
export async function initiateSmbSync(
  phoneId: string,
  accessToken: string,
  syncType: "smb_app_state_sync" | "history",
  options?: GraphOptions,
): Promise<{ requestId?: string; alreadyRequested: boolean }> {
  try {
    // Code 4 is also a rate-limit code — don't let the HTTP layer retry it
    const data = await graph(accessToken, { ...options, retry: false }).request<{ request_id?: string }>(
      {
        method: "POST",
        path: `/${encodeURIComponent(phoneId)}/smb_app_data`,
        json: { messaging_product: "whatsapp", sync_type: syncType },
      },
      options,
    );
    return { ...(data.request_id && { requestId: data.request_id }), alreadyRequested: false };
  } catch (err) {
    // Error code 4 here means the sync was already triggered for this number
    if (err instanceof WhatsAppError && err.code === 4) return { alreadyRequested: true };
    throw err;
  }
}

function graph(token: string | undefined, options?: GraphOptions): HttpClient {
  return new HttpClient({ ...options, token });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
