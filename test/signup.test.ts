import { describe, expect, it } from "vitest";
import {
  exchangeCodeForToken,
  generatePin,
  getWabaPhoneNumbers,
  initiateSmbSync,
  registerPhoneNumber,
  subscribeAppToWaba,
  WhatsAppError,
} from "../src/index.js";
import { graphError, json, mockFetch } from "./helpers.js";

describe("Embedded Signup helpers", () => {
  it("generatePin returns 6 digits", () => {
    for (let i = 0; i < 200; i++) expect(generatePin()).toMatch(/^[1-9]\d{5}$/);
  });

  it("exchangeCodeForToken sends app credentials without an Authorization header", async () => {
    const { fetch, calls } = mockFetch(json({ access_token: "LONG_TOKEN", token_type: "bearer" }));

    const res = await exchangeCodeForToken({ appId: "APP", appSecret: "SECRET", code: "CODE" }, { fetch });

    expect(res).toEqual({ accessToken: "LONG_TOKEN", tokenType: "bearer" });
    expect(calls[0]!.url.pathname).toBe("/v25.0/oauth/access_token");
    expect(calls[0]!.url.searchParams.get("client_id")).toBe("APP");
    expect(calls[0]!.url.searchParams.get("code")).toBe("CODE");
    expect(calls[0]!.headers.Authorization).toBeUndefined();
  });

  it("exchangeCodeForToken surfaces expired codes as WhatsAppError", async () => {
    const { fetch } = mockFetch(graphError(100));
    await expect(exchangeCodeForToken({ appId: "A", appSecret: "S", code: "C" }, { fetch })).rejects.toMatchObject({
      code: 100,
    });
  });

  it("subscribeAppToWaba throws when Meta does not confirm", async () => {
    const ok = mockFetch(json({ success: true }));
    await expect(subscribeAppToWaba("WABA", "TOKEN", { fetch: ok.fetch })).resolves.toEqual({ success: true });
    expect(ok.calls[0]!.url.pathname).toBe("/v25.0/WABA/subscribed_apps");

    const notOk = mockFetch(json({ success: false }));
    await expect(subscribeAppToWaba("WABA", "TOKEN", { fetch: notOk.fetch })).rejects.toBeInstanceOf(WhatsAppError);
  });

  it("getWabaPhoneNumbers returns the list", async () => {
    const { fetch } = mockFetch(json({ data: [{ id: "P1", display_phone_number: "+1 555" }] }));
    expect(await getWabaPhoneNumbers("WABA", "TOKEN", { fetch })).toEqual([{ id: "P1", display_phone_number: "+1 555" }]);
  });

  it("registerPhoneNumber retries until success and returns all attempts", async () => {
    const { fetch, calls } = mockFetch(graphError(133005), json({ success: false }), json({ success: true }));

    const res = await registerPhoneNumber("PHONE", "TOKEN", "123456", { fetch, backoffMs: 1 });

    expect(res.success).toBe(true);
    expect(res.attempts).toHaveLength(3);
    expect(calls).toHaveLength(3);
    expect(calls[0]!.body).toEqual({ messaging_product: "whatsapp", pin: "123456" });
  });

  it("registerPhoneNumber throws with every attempt attached", async () => {
    const { fetch } = mockFetch(graphError(133005));
    const err = await registerPhoneNumber("PHONE", "TOKEN", "123456", { fetch, backoffMs: 1, attempts: 2 }).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(WhatsAppError);
    expect(err.code).toBe(133005);
    expect(err.message).toMatch(/after 2 attempt/);
    expect(err.body.attempts).toHaveLength(2);
  });

  it("initiateSmbSync treats error code 4 as already requested (no retries)", async () => {
    const { fetch, calls } = mockFetch(graphError(4));
    expect(await initiateSmbSync("PHONE", "TOKEN", "history", { fetch })).toEqual({ alreadyRequested: true });
    expect(calls).toHaveLength(1);

    const ok = mockFetch(json({ request_id: "REQ" }));
    expect(await initiateSmbSync("PHONE", "TOKEN", "history", { fetch: ok.fetch })).toEqual({
      requestId: "REQ",
      alreadyRequested: false,
    });
  });
});
