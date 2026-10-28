/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const encoder = new TextEncoder();

/** The raw request body, exactly as received — before any JSON parsing. */
export type RawBody = string | ArrayBuffer | Uint8Array;

/**
 * Verify the `X-Hub-Signature-256` header Meta sends with every webhook POST.
 *
 * The signature is an HMAC-SHA256 of the **raw** request body using your app
 * secret. Re-serializing a parsed JSON body will not match — pass the bytes
 * you received. Uses the Web Crypto API, so it works in Node.js 22+, Bun,
 * Deno, Cloudflare Workers and other edge runtimes. Comparison is constant-time.
 *
 * @returns `true` if the signature is valid, `false` if missing/malformed/invalid
 */
export async function verifyWebhookSignature(
  rawBody: RawBody,
  signatureHeader: string | null | undefined,
  appSecret: string,
): Promise<boolean> {
  if (!appSecret) throw new TypeError("verifyWebhookSignature: `appSecret` is required.");
  if (
    typeof rawBody !== "string" &&
    !(rawBody instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(rawBody)
  ) {
    throw new TypeError(
      "verifyWebhookSignature: `rawBody` must be the raw request body (string, ArrayBuffer or Uint8Array), not a parsed object.",
    );
  }
  if (!signatureHeader) return false;

  const match = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader.trim());
  if (!match) return false;

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("verifyWebhookSignature: the Web Crypto API (globalThis.crypto.subtle) is not available in this runtime.");
  }

  const key = await subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  // subtle.verify compares in constant time
  return subtle.verify("HMAC", key, hexToBytes(match[1]!), toBytes(rawBody));
}

/**
 * Handle Meta's webhook verification request (GET with `hub.*` query params).
 *
 * @returns the `hub.challenge` value to send back with HTTP 200, or `null`
 *          if the request is invalid (respond with 403)
 */
export function verifyWebhookChallenge(
  query: URLSearchParams | Record<string, unknown>,
  verifyToken: string,
): string | null {
  const get = (key: string): unknown => (query instanceof URLSearchParams ? query.get(key) : query[key]);
  const mode = get("hub.mode");
  const token = get("hub.verify_token");
  const challenge = get("hub.challenge");

  if (mode === "subscribe" && typeof token === "string" && token === verifyToken && typeof challenge === "string") {
    return challenge;
  }
  return null;
}

function toBytes(body: RawBody): Uint8Array<ArrayBuffer> {
  if (typeof body === "string") return encoder.encode(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer);
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
