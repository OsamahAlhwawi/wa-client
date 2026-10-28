import { describe, expect, it, vi } from "vitest";
import { WhatsAppError } from "../src/index.js";
import { createClient, graphError, json, mockFetch, sent } from "./helpers.js";

describe("HTTP layer", () => {
  it("never puts the access token in the URL, including GET requests", async () => {
    const { fetch, calls } = mockFetch(json({ data: [] }));
    const wa = createClient(fetch);

    await wa.getQRCodes();

    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url.searchParams.has("access_token")).toBe(false);
    expect(calls[0]!.headers.Authorization).toBe("Bearer TEST_TOKEN");
  });

  it("turns Graph API errors into WhatsAppError with all fields", async () => {
    const { fetch } = mockFetch(
      graphError(131047, 400, {
        error_subcode: 2494010,
        error_user_title: "Window closed",
        error_user_msg: "More than 24 hours have passed",
        error_data: { messaging_product: "whatsapp", details: "Re-engagement message" },
      }),
    );
    const wa = createClient(fetch);

    const err = await wa.sendText("1", "x").catch((e) => e);

    expect(err).toBeInstanceOf(WhatsAppError);
    expect(err).toMatchObject({
      kind: "api",
      status: 400,
      code: 131047,
      subcode: 2494010,
      type: "OAuthException",
      userTitle: "Window closed",
      message: "More than 24 hours have passed",
      details: "Re-engagement message",
      fbtraceId: "trace",
    });
    expect(err.isRateLimit).toBe(false);
  });

  it("reports a clear error for non-JSON responses (e.g. a 502 HTML page)", async () => {
    const html = new Response("<html><body>502 Bad Gateway</body></html>", {
      status: 502,
      statusText: "Bad Gateway",
      headers: { "content-type": "text/html" },
    });
    const { fetch } = mockFetch(html);
    const wa = createClient(fetch, { retry: false });

    const err = await wa.sendText("1", "x").catch((e) => e);

    expect(err).toBeInstanceOf(WhatsAppError);
    expect(err.kind).toBe("http");
    expect(err.status).toBe(502);
    expect(err.message).toBe("WhatsApp API request failed with HTTP 502 Bad Gateway");
    expect(err.body).toContain("502 Bad Gateway");
    expect(err).not.toBeInstanceOf(SyntaxError);
  });

  it("reports a clear error when a 200 response is not JSON", async () => {
    const { fetch } = mockFetch(new Response("OK", { status: 200, headers: { "content-type": "text/plain" } }));
    const wa = createClient(fetch);
    const err = await wa.getQRCodes().catch((e) => e);
    expect(err.kind).toBe("http");
    expect(err.message).toMatch(/non-JSON response/);
  });

  it("retries rate-limit errors (130429) and succeeds", async () => {
    const { fetch, calls } = mockFetch(graphError(130429), graphError(130429), sent("wamid.ok"));
    const wa = createClient(fetch);

    const res = await wa.sendText("1", "x");

    expect(res.messages[0]?.id).toBe("wamid.ok");
    expect(calls).toHaveLength(3);
  });

  it("gives up after the configured number of retries", async () => {
    const { fetch, calls } = mockFetch(graphError(130429));
    const wa = createClient(fetch, { retry: { retries: 2, minDelayMs: 1, maxDelayMs: 1 } });

    const err = await wa.sendText("1", "x").catch((e) => e);

    expect(err.code).toBe(130429);
    expect(calls).toHaveLength(3);
  });

  it("does not retry non-rate-limit errors such as 131048", async () => {
    const { fetch, calls } = mockFetch(graphError(131048));
    const wa = createClient(fetch);
    await expect(wa.sendText("1", "x")).rejects.toMatchObject({ code: 131048 });
    expect(calls).toHaveLength(1);
  });

  it("retries 5xx for GET but never for POST (could double-send)", async () => {
    const get = mockFetch(json({}, 500), json({ data: [] }));
    await createClient(get.fetch).getQRCodes();
    expect(get.calls).toHaveLength(2);

    const post = mockFetch(json({}, 500), sent());
    await expect(createClient(post.fetch).sendText("1", "x")).rejects.toMatchObject({ status: 500 });
    expect(post.calls).toHaveLength(1);
  });

  it("does not retry when retry is disabled", async () => {
    const { fetch, calls } = mockFetch(graphError(130429));
    await expect(createClient(fetch, { retry: false }).sendText("1", "x")).rejects.toBeInstanceOf(WhatsAppError);
    expect(calls).toHaveLength(1);
  });

  it("times out slow requests", async () => {
    const slow = (_: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    const wa = createClient(slow as typeof fetch, { timeoutMs: 20, retry: false });

    const err = await wa.sendText("1", "x").catch((e) => e);

    expect(err).toBeInstanceOf(WhatsAppError);
    expect(err.kind).toBe("timeout");
  });

  it("supports per-call AbortSignal", async () => {
    const { fetch } = mockFetch(sent());
    const wa = createClient(fetch);
    const controller = new AbortController();
    controller.abort();

    const err = await wa.sendText("1", "x", { signal: controller.signal }).catch((e) => e);

    expect(err.kind).toBe("aborted");
  });

  it("wraps network failures", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const wa = createClient(failing as unknown as typeof fetch, { retry: false });
    const err = await wa.sendText("1", "x").catch((e) => e);
    expect(err.kind).toBe("network");
    expect(err.message).toContain("fetch failed");
  });

  it("logs requests without leaking the token", async () => {
    const debug = vi.fn();
    const { fetch } = mockFetch(sent());
    await createClient(fetch, { logger: { debug } }).sendText("1", "x");
    expect(debug).toHaveBeenCalled();
    expect(JSON.stringify(debug.mock.calls)).not.toContain("TEST_TOKEN");
  });
});
