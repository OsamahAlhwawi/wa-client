/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DEFAULT_API_VERSION, DEFAULT_BASE_URL, DEFAULT_RETRY, DEFAULT_TIMEOUT_MS } from "./constants.js";
import { WhatsAppError, type WhatsAppApiError } from "./errors.js";

// ─── Public option types ─────────────────────────────────────────

export interface RetryOptions {
  /** Max number of retries after the first attempt (default 3). */
  retries?: number;
  /** Delay before the first retry; doubles on every attempt (default 500ms). */
  minDelayMs?: number;
  /** Upper bound for a single delay (default 10s). */
  maxDelayMs?: number;
}

/**
 * Minimal logger interface — `console`, pino-compatible wrappers, etc.
 * The access token is never passed to the logger.
 */
export interface WhatsAppLogger {
  debug?(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
}

/** Per-call options accepted by every client method. */
export interface RequestOptions {
  /** Cancel the request (and any pending retries). */
  signal?: AbortSignal;
  /** Override the client-wide timeout for this call. `0` disables it. */
  timeoutMs?: number;
}

export interface HttpClientOptions {
  token?: string;
  apiVersion?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  retry?: RetryOptions | false;
  logger?: WhatsAppLogger;
}

// ─── Internal request description ────────────────────────────────

type QueryValue = string | number | boolean | undefined;

export interface HttpRequest {
  method: "GET" | "POST" | "DELETE";
  /** Graph path (`/123/messages`) or an absolute URL (media downloads). */
  path: string;
  query?: Record<string, QueryValue>;
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
  /** `bearer` (default), `oauth` (resumable upload), or `none` (OAuth code exchange). */
  auth?: "bearer" | "oauth" | "none";
}

export interface BinaryResponse {
  data: Uint8Array;
  contentType: string | null;
}

/**
 * Thin fetch wrapper shared by WhatsAppClient and the Embedded Signup helpers.
 * Handles auth headers, timeouts, abort signals, error parsing and retries.
 */
export class HttpClient {
  private readonly token?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly retry: Required<RetryOptions> | false;
  private readonly logger?: WhatsAppLogger;

  constructor(options: HttpClientOptions) {
    this.token = options.token;
    this.baseUrl = `${(options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "")}/${options.apiVersion ?? DEFAULT_API_VERSION}`;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retry = options.retry === false ? false : { ...DEFAULT_RETRY, ...options.retry };
    this.logger = options.logger;

    // Bind so a detached global fetch keeps working in browsers/workers
    const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
    if (typeof fetchImpl !== "function") {
      throw new TypeError("No fetch implementation found. Use Node.js 22+ or pass `fetch` in the options.");
    }
    this.fetchImpl = fetchImpl;
  }

  /** Perform a request and parse the JSON response. */
  request<T>(req: HttpRequest, options?: RequestOptions): Promise<T> {
    return this.withRetry(req, options, async (res, text) => parseJson<T>(res, text));
  }

  /** Perform a request and return the raw bytes (used for media downloads). */
  requestBinary(req: HttpRequest, options?: RequestOptions): Promise<BinaryResponse> {
    return this.withRetry(req, options, async (res) => ({
      data: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get("content-type"),
    }), true);
  }

  // ─── Internals ─────────────────────────────────────────────────

  private async withRetry<T>(
    req: HttpRequest,
    options: RequestOptions | undefined,
    onSuccess: (res: Response, text: string) => Promise<T>,
    binary = false,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.once(req, options, onSuccess, binary);
      } catch (err) {
        if (!this.retry || attempt >= this.retry.retries || !isRetryable(err, req.method)) {
          throw err;
        }
        const delay = backoffDelay(attempt, this.retry);
        this.logger?.warn?.("Retrying WhatsApp API request", {
          method: req.method,
          path: redactPath(req.path),
          attempt: attempt + 1,
          delayMs: delay,
          code: (err as WhatsAppError).code,
          status: (err as WhatsAppError).status,
        });
        await sleep(delay, options?.signal);
      }
    }
  }

  private async once<T>(
    req: HttpRequest,
    options: RequestOptions | undefined,
    onSuccess: (res: Response, text: string) => Promise<T>,
    binary: boolean,
  ): Promise<T> {
    const signal = options?.signal;
    if (signal?.aborted) throw abortedError(signal.reason);

    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs ?? this.timeoutMs;
    let timedOut = false;
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs)
        : undefined;
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", onAbort, { once: true });

    this.logger?.debug?.("WhatsApp API request", { method: req.method, path: redactPath(req.path) });

    try {
      const res = await this.fetchImpl(this.buildUrl(req), {
        method: req.method,
        headers: this.buildHeaders(req),
        body: req.json !== undefined ? JSON.stringify(req.json) : req.body,
        signal: controller.signal,
      });

      if (!res.ok || !binary) {
        const text = await res.text();
        if (!res.ok) throw errorFromResponse(res, text);
        return await onSuccess(res, text);
      }
      return await onSuccess(res, "");
    } catch (err) {
      if (err instanceof WhatsAppError) throw err;
      if (timedOut) {
        throw new WhatsAppError(`WhatsApp API request timed out after ${timeoutMs}ms`, {
          kind: "timeout",
          cause: err,
        });
      }
      if (signal?.aborted) throw abortedError(signal.reason);
      throw new WhatsAppError(
        `WhatsApp API request failed: ${err instanceof Error ? err.message : String(err)}`,
        { kind: "network", cause: err },
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  private buildUrl(req: HttpRequest): string {
    const url = new URL(/^https?:\/\//.test(req.path) ? req.path : `${this.baseUrl}${req.path}`);
    for (const [key, value] of Object.entries(req.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private buildHeaders(req: HttpRequest): Record<string, string> {
    const headers: Record<string, string> = { ...req.headers };
    const auth = req.auth ?? "bearer";
    if (auth !== "none") {
      if (!this.token) throw new TypeError("An access token is required for this request.");
      // The token always travels in a header, never in the URL, so it can't leak into logs or proxies
      headers["Authorization"] = `${auth === "oauth" ? "OAuth" : "Bearer"} ${this.token}`;
    }
    if (req.json !== undefined) headers["Content-Type"] = "application/json";
    return headers;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function parseJson<T>(res: Response, text: string): T {
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new WhatsAppError(
      `WhatsApp API returned a non-JSON response (HTTP ${res.status}, ${res.headers.get("content-type") ?? "unknown content type"})`,
      { kind: "http", status: res.status, body: text.slice(0, 1000), cause: err },
    );
  }
}

function errorFromResponse(res: Response, text: string): WhatsAppError {
  let body: unknown = text.slice(0, 1000);
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON (e.g. an HTML 502 page from a proxy) — keep the text snippet
  }

  const apiError = isRecord(body) && isRecord(body.error) ? (body.error as unknown as WhatsAppApiError) : undefined;
  if (apiError && typeof apiError.message === "string") {
    return WhatsAppError.fromApiError(apiError, res.status, body);
  }

  return new WhatsAppError(
    `WhatsApp API request failed with HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`,
    { kind: "http", status: res.status, body },
  );
}

/**
 * Rate-limit errors are always safe to retry (Meta rejected the request).
 * Server/network errors are only retried for GET — a failed POST may have
 * actually sent the message, and retrying would deliver it twice.
 */
function isRetryable(err: unknown, method: HttpRequest["method"]): boolean {
  if (!(err instanceof WhatsAppError) || err.kind === "aborted") return false;
  if (err.isRateLimit) return true;
  if (method !== "GET") return false;
  return err.kind === "network" || err.kind === "timeout" || err.status >= 500;
}

function backoffDelay(attempt: number, retry: Required<RetryOptions>): number {
  const exp = Math.min(retry.maxDelayMs, retry.minDelayMs * 2 ** attempt);
  // Jitter in [exp/2, exp] so parallel bulk sends don't retry in lockstep
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortedError(signal.reason));
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortedError(signal?.reason));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortedError(reason: unknown): WhatsAppError {
  return new WhatsAppError("WhatsApp API request was aborted", { kind: "aborted", cause: reason });
}

/** Strip query strings from absolute URLs (signed media URLs) before logging. */
function redactPath(path: string): string {
  return path.split("?")[0] ?? path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
