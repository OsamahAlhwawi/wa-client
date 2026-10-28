/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const DEFAULT_API_VERSION = "v25.0";
export const DEFAULT_BASE_URL = "https://graph.facebook.com";
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_RETRY = {
  retries: 3,
  minDelayMs: 500,
  maxDelayMs: 10_000,
} as const;
export const DEFAULT_BULK_CONCURRENCY = 20;

/**
 * Error codes that mean "slow down" — the request was rejected before it was
 * processed, so it is always safe to retry after a delay.
 *
 * - 4       Application-level throttling
 * - 80007   WhatsApp Business Account rate limit
 * - 130429  Cloud API throughput limit reached
 * - 131056  Too many messages to the same user (pair rate limit)
 *
 * 131048 (spam rate limit / messaging tier exhausted) is deliberately not here:
 * retrying it within minutes does not help.
 */
export const RATE_LIMIT_CODES: ReadonlySet<number> = new Set([4, 80007, 130429, 131056]);
