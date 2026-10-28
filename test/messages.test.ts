import { describe, expect, it } from "vitest";
import { WhatsAppClient } from "../src/index.js";
import { createClient, mockFetch, sent, json } from "./helpers.js";

describe("WhatsAppClient — messages", () => {
  it("sends text to the messages endpoint of the default API version", async () => {
    const { fetch, calls } = mockFetch(sent("wamid.1"));
    const wa = createClient(fetch);

    const res = await wa.sendText("15551234567", "Hello", { replyTo: "wamid.0", previewUrl: true });

    expect(res.messages[0]?.id).toBe("wamid.1");
    expect(calls[0]!.url.toString()).toBe("https://graph.facebook.com/v25.0/PHONE_ID/messages");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.headers.Authorization).toBe("Bearer TEST_TOKEN");
    expect(calls[0]!.body).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "15551234567",
      type: "text",
      text: { body: "Hello", preview_url: true },
      context: { message_id: "wamid.0" },
    });
  });

  it("respects a custom apiVersion and baseUrl", async () => {
    const { fetch, calls } = mockFetch(sent());
    const wa = createClient(fetch, { apiVersion: "v24.0", baseUrl: "https://proxy.example.com/" });
    await wa.sendText("1", "x");
    expect(calls[0]!.url.toString()).toBe("https://proxy.example.com/v24.0/PHONE_ID/messages");
  });

  it("sends media by link or by uploaded id, dropping unsupported fields", async () => {
    const { fetch, calls } = mockFetch(sent());
    const wa = createClient(fetch);

    await wa.sendMedia("1", { type: "image", url: "https://x/a.jpg", caption: "hi" });
    await wa.sendMedia("1", { type: "audio", id: "MEDIA_ID", caption: "ignored", voice: true });
    await wa.sendMedia("1", { type: "document", url: "https://x/a.pdf", filename: "a.pdf" });

    expect(calls[0]!.body).toMatchObject({ type: "image", image: { link: "https://x/a.jpg", caption: "hi" } });
    expect(calls[1]!.body).toMatchObject({ type: "audio", audio: { id: "MEDIA_ID", voice: true } });
    expect((calls[1]!.body as any).audio.caption).toBeUndefined();
    expect(calls[2]!.body).toMatchObject({ document: { link: "https://x/a.pdf", filename: "a.pdf" } });
  });

  it("sends location and contacts", async () => {
    const { fetch, calls } = mockFetch(sent());
    const wa = createClient(fetch);

    await wa.sendLocation("1", { latitude: 24.7, longitude: 46.6, name: "Office" });
    await wa.sendContacts("1", [{ name: { formatted_name: "Sara" }, phones: [{ phone: "+966500000000", type: "CELL" }] }]);

    expect(calls[0]!.body).toMatchObject({ type: "location", location: { latitude: 24.7, longitude: 46.6, name: "Office" } });
    expect(calls[1]!.body).toMatchObject({ type: "contacts", contacts: [{ name: { formatted_name: "Sara" } }] });
  });

  it("builds interactive buttons, list and CTA payloads", async () => {
    const { fetch, calls } = mockFetch(sent());
    const wa = createClient(fetch);

    await wa.sendInteractiveButtons("1", {
      body: "Pick one",
      footer: "f",
      buttons: [{ id: "yes", title: "Yes" }],
    });
    await wa.sendInteractiveList("1", {
      header: "Menu",
      body: "Choose",
      buttonText: "Open",
      sections: [{ title: "S", rows: [{ id: "r1", title: "Row 1", description: "d" }] }],
    });
    await wa.sendCtaUrl("1", { body: "Visit", buttonText: "Go", url: "https://example.com" });

    expect(calls[0]!.body).toMatchObject({
      interactive: {
        type: "button",
        body: { text: "Pick one" },
        footer: { text: "f" },
        action: { buttons: [{ type: "reply", reply: { id: "yes", title: "Yes" } }] },
      },
    });
    expect(calls[1]!.body).toMatchObject({
      interactive: {
        type: "list",
        header: { type: "text", text: "Menu" },
        action: { button: "Open", sections: [{ title: "S", rows: [{ id: "r1" }] }] },
      },
    });
    expect(calls[2]!.body).toMatchObject({
      interactive: {
        type: "cta_url",
        action: { name: "cta_url", parameters: { display_text: "Go", url: "https://example.com" } },
      },
    });
  });

  it("sends templates with deterministic language policy", async () => {
    const { fetch, calls } = mockFetch(sent());
    const wa = createClient(fetch);
    await wa.sendTemplate("1", {
      name: "order_update",
      language: "ar",
      components: [{ type: "body", parameters: [{ type: "text", text: "123" }] }],
    });
    expect(calls[0]!.body).toMatchObject({
      type: "template",
      template: { name: "order_update", language: { code: "ar", policy: "deterministic" } },
    });
  });

  it("marks a message as read with an optional typing indicator", async () => {
    const { fetch, calls } = mockFetch(json({ success: true }));
    const wa = createClient(fetch);

    const res = await wa.markAsRead("wamid.IN", { typingIndicator: true });

    expect(res.success).toBe(true);
    expect(calls[0]!.body).toEqual({
      messaging_product: "whatsapp",
      status: "read",
      message_id: "wamid.IN",
      typing_indicator: { type: "text" },
    });
  });

  it("validates required config", () => {
    expect(() => new WhatsAppClient({ token: "", phoneId: "x" })).toThrow(/token/);
    expect(() => new WhatsAppClient({ token: "x", phoneId: "" })).toThrow(/phoneId/);
  });
});
