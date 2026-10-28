import { WhatsAppClient, type WhatsAppConfig } from "../src/index.js";

export interface RecordedCall {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Responder = Response | ((call: RecordedCall) => Response | Promise<Response>);

/**
 * A fake fetch that records every call and replies from a queue.
 * The last responder is reused once the queue runs out.
 */
export function mockFetch(...responders: Responder[]) {
  const calls: RecordedCall[] = [];

  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const call: RecordedCall = {
      url: new URL(String(input)),
      method: init?.method ?? "GET",
      headers: { ...(init?.headers as Record<string, string>) },
      body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    };
    calls.push(call);

    if (init?.signal?.aborted) throw init.signal.reason ?? new DOMException("Aborted", "AbortError");

    const responder = responders.length > 1 ? responders.shift()! : responders[0]!;
    const response = typeof responder === "function" ? await responder(call) : responder.clone();
    return response;
  };

  return { fetch: fetch as typeof globalThis.fetch, calls };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function graphError(code: number, status = 400, extra: Record<string, unknown> = {}): Response {
  return json({ error: { message: `Error ${code}`, type: "OAuthException", code, fbtrace_id: "trace", ...extra } }, status);
}

export const sent = (id = "wamid.TEST") =>
  json({ messaging_product: "whatsapp", contacts: [{ input: "15551234567", wa_id: "15551234567" }], messages: [{ id }] });

export function createClient(fetch: typeof globalThis.fetch, config: Partial<WhatsAppConfig> = {}) {
  return new WhatsAppClient({
    token: "TEST_TOKEN",
    phoneId: "PHONE_ID",
    wabaId: "WABA_ID",
    fetch,
    retry: { retries: 3, minDelayMs: 1, maxDelayMs: 2 },
    ...config,
  });
}
