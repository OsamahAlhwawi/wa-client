import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseWebhook, verifyWebhookChallenge, verifyWebhookSignature, type WebhookPayload } from "../src/index.js";

const APP_SECRET = "app_secret_123";
const sign = (body: string, secret = APP_SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

const payload: WebhookPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15550000000", phone_number_id: "PHONE_ID" },
            contacts: [
              { wa_id: "111", profile: { name: "Ali" } },
              { wa_id: "222", profile: { name: "Sara" } },
            ],
            messages: [
              { from: "111", id: "wamid.A", timestamp: "1700000000", type: "text", text: { body: "hi" } },
              {
                from: "222",
                id: "wamid.B",
                timestamp: "1700000001",
                type: "interactive",
                interactive: { type: "list_reply", list_reply: { id: "row1", title: "Row 1" } },
              },
            ],
          },
        },
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15550000000", phone_number_id: "PHONE_ID" },
            statuses: [
              {
                id: "wamid.OUT",
                status: "failed",
                timestamp: "1700000002",
                recipient_id: "333",
                errors: [{ code: 131047, title: "Re-engagement message" }],
              },
            ],
          },
        },
        { field: "message_template_status_update", value: { event: "APPROVED", message_template_name: "t" } },
      ],
    },
  ],
};

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify(payload);

  it("accepts a valid signature (string, Uint8Array and ArrayBuffer bodies)", async () => {
    const bytes = new TextEncoder().encode(body);
    expect(await verifyWebhookSignature(body, sign(body), APP_SECRET)).toBe(true);
    expect(await verifyWebhookSignature(bytes, sign(body), APP_SECRET)).toBe(true);
    expect(await verifyWebhookSignature(bytes.buffer, sign(body), APP_SECRET)).toBe(true);
    expect(await verifyWebhookSignature(Buffer.from(body), sign(body).toUpperCase().replace("SHA256", "sha256"), APP_SECRET)).toBe(true);
  });

  it("handles Buffers that are views into a larger pool", async () => {
    const pool = Buffer.from(`xxxx${body}yyyy`);
    const view = pool.subarray(4, 4 + Buffer.byteLength(body));
    expect(await verifyWebhookSignature(view, sign(body), APP_SECRET)).toBe(true);
  });

  it("rejects tampered bodies, wrong secrets and malformed headers", async () => {
    expect(await verifyWebhookSignature(body + " ", sign(body), APP_SECRET)).toBe(false);
    expect(await verifyWebhookSignature(body, sign(body, "other"), APP_SECRET)).toBe(false);
    expect(await verifyWebhookSignature(body, undefined, APP_SECRET)).toBe(false);
    expect(await verifyWebhookSignature(body, "", APP_SECRET)).toBe(false);
    expect(await verifyWebhookSignature(body, "sha1=abc", APP_SECRET)).toBe(false);
    expect(await verifyWebhookSignature(body, "sha256=zz", APP_SECRET)).toBe(false);
  });

  it("throws a helpful error when given a parsed object instead of the raw body", async () => {
    await expect(verifyWebhookSignature(payload as never, sign(body), APP_SECRET)).rejects.toThrow(/raw request body/);
  });

  it("requires an app secret", async () => {
    await expect(verifyWebhookSignature(body, sign(body), "")).rejects.toThrow(/appSecret/);
  });
});

describe("verifyWebhookChallenge", () => {
  it("returns the challenge for a valid subscribe request", () => {
    const query = { "hub.mode": "subscribe", "hub.verify_token": "secret", "hub.challenge": "12345" };
    expect(verifyWebhookChallenge(query, "secret")).toBe("12345");
    expect(verifyWebhookChallenge(new URLSearchParams(query), "secret")).toBe("12345");
  });

  it("returns null for a wrong token or mode", () => {
    expect(verifyWebhookChallenge({ "hub.mode": "subscribe", "hub.verify_token": "x", "hub.challenge": "1" }, "secret")).toBeNull();
    expect(verifyWebhookChallenge({ "hub.mode": "other", "hub.verify_token": "secret", "hub.challenge": "1" }, "secret")).toBeNull();
    expect(verifyWebhookChallenge({}, "secret")).toBeNull();
  });
});

describe("parseWebhook", () => {
  it("flattens messages, statuses and other fields into typed events", () => {
    const events = parseWebhook(payload);

    expect(events.map((e) => e.type)).toEqual(["message", "message", "status", "other"]);

    const [first, second, status, other] = events;
    if (first?.type !== "message" || first.message.type !== "text") throw new Error("expected text message");
    expect(first.message.text.body).toBe("hi");
    expect(first.contact?.profile?.name).toBe("Ali");
    expect(first.wabaId).toBe("WABA_ID");
    expect(first.metadata.phone_number_id).toBe("PHONE_ID");

    // Contact is matched by sender, not by position
    if (second?.type !== "message") throw new Error("expected message");
    expect(second.contact?.profile?.name).toBe("Sara");

    if (status?.type !== "status") throw new Error("expected status");
    expect(status.status.errors?.[0]?.code).toBe(131047);

    expect(other).toMatchObject({ type: "other", field: "message_template_status_update" });
  });

  it("returns an empty list for junk input", () => {
    expect(parseWebhook(null)).toEqual([]);
    expect(parseWebhook({})).toEqual([]);
    expect(parseWebhook("nope")).toEqual([]);
  });
});
