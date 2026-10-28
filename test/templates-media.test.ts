import { describe, expect, it } from "vitest";
import { createClient, graphError, json, mockFetch, sent } from "./helpers.js";

const template = (name: string, language = "en") => ({
  id: `id_${name}_${language}`,
  name,
  language,
  status: "APPROVED",
  category: "UTILITY",
  components: [],
});

describe("Templates", () => {
  it("follows pagination cursors until there is no next page", async () => {
    const { fetch, calls } = mockFetch(
      json({ data: [template("a"), template("b")], paging: { cursors: { after: "CUR1" }, next: "https://next" } }),
      json({ data: [template("c")], paging: { cursors: { after: "CUR2" } } }),
    );
    const wa = createClient(fetch);

    const templates = await wa.getTemplates({ status: ["APPROVED"] });

    expect(templates.map((t) => t.name)).toEqual(["a", "b", "c"]);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url.pathname).toBe("/v25.0/WABA_ID/message_templates");
    expect(calls[0]!.url.searchParams.get("limit")).toBe("100");
    expect(calls[0]!.url.searchParams.get("status")).toBe("APPROVED");
    expect(calls[0]!.url.searchParams.has("after")).toBe(false);
    expect(calls[1]!.url.searchParams.get("after")).toBe("CUR1");
  });

  it("stops at maxPages", async () => {
    const page = json({ data: [template("a")], paging: { cursors: { after: "X" }, next: "https://next" } });
    const { fetch, calls } = mockFetch(page);
    await createClient(fetch).getTemplates({ maxPages: 2 });
    expect(calls).toHaveLength(2);
  });

  it("getTemplate returns the exact name + language match", async () => {
    const { fetch } = mockFetch(json({ data: [template("promo_2"), template("promo"), template("promo", "ar")] }));
    const wa = createClient(fetch);
    expect((await wa.getTemplate("promo", "ar"))?.id).toBe("id_promo_ar");
  });

  it("getTemplateButtons extracts QUICK_REPLY buttons only", async () => {
    const { fetch } = mockFetch(
      json({
        data: [
          {
            name: "survey",
            status: "APPROVED",
            components: [
              {
                type: "BUTTONS",
                buttons: [
                  { type: "QUICK_REPLY", text: "Yes" },
                  { type: "URL", text: "Site" },
                ],
              },
            ],
          },
          { name: "plain", status: "APPROVED", components: [{ type: "BODY", text: "hi" }] },
        ],
      }),
    );
    expect(await createClient(fetch).getTemplateButtons()).toEqual([{ templateName: "survey", buttons: ["Yes"] }]);
  });

  it("createTemplate does not log and defaults to positional parameters", async () => {
    const { fetch, calls } = mockFetch(json({ id: "1", status: "PENDING", category: "UTILITY" }));
    const original = console.log;
    const logged: unknown[] = [];
    console.log = (...args: unknown[]) => logged.push(args);
    try {
      await createClient(fetch).createTemplate({
        name: "t",
        language: "en",
        category: "UTILITY",
        components: [{ type: "BODY", text: "Hi {{1}}" }],
      });
    } finally {
      console.log = original;
    }
    expect(logged).toHaveLength(0);
    expect(calls[0]!.body).toMatchObject({ messaging_product: "whatsapp", parameter_format: "positional", name: "t" });
  });

  it("throws a clear error when wabaId is missing", async () => {
    const { fetch } = mockFetch(json({ data: [] }));
    const wa = createClient(fetch, { wabaId: undefined });
    await expect(wa.getTemplates()).rejects.toThrow(/wabaId/);
  });
});

describe("Bulk send", () => {
  it("keeps input order, reports partial failures and per-recipient components", async () => {
    const { fetch, calls } = mockFetch((call) => {
      const to = (call.body as { to: string }).to;
      return to === "bad" ? graphError(131026) : sent(`wamid.${to}`);
    });
    const wa = createClient(fetch);
    const progress: number[] = [];

    const result = await wa.sendTemplateBulk(["a", "bad", "c"], { name: "t", language: "en" }, {
      concurrency: 2,
      components: { c: [{ type: "body", parameters: [{ type: "text", text: "C" }] }] },
      onProgress: (_r, done) => progress.push(done),
    });

    expect(result).toMatchObject({ total: 3, successful: 2, failed: 1 });
    expect(result.results.map((r) => r.phone)).toEqual(["a", "bad", "c"]);
    expect(result.results[1]).toMatchObject({ success: false, errorCode: 131026 });
    expect(result.results[2]?.wamid).toBe("wamid.c");
    expect(progress).toEqual([1, 2, 3]);

    const cCall = calls.find((c) => (c.body as { to: string }).to === "c")!;
    expect((cCall.body as any).template.components[0].parameters[0].text).toBe("C");
  });

  it("never runs more requests than the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const { fetch } = mockFetch(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return sent();
    });
    const phones = Array.from({ length: 30 }, (_, i) => String(i));

    await createClient(fetch).sendTemplateBulk(phones, { name: "t", language: "en" }, { concurrency: 4 });

    expect(peak).toBe(4);
  });

  it("retries a rate-limited recipient instead of failing it", async () => {
    let first = true;
    const { fetch } = mockFetch(() => {
      if (first) {
        first = false;
        return graphError(130429);
      }
      return sent();
    });
    const result = await createClient(fetch).sendTemplateBulk(["a", "b"], { name: "t", language: "en" });
    expect(result.successful).toBe(2);
  });

  it("handles an empty recipient list", async () => {
    const { fetch } = mockFetch(sent());
    expect(await createClient(fetch).sendTemplateBulk([], { name: "t", language: "en" })).toEqual({
      total: 0,
      successful: 0,
      failed: 0,
      results: [],
    });
  });
});

describe("Media", () => {
  it("looks up a media URL and downloads it with the bearer token", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const { fetch, calls } = mockFetch(
      json({
        messaging_product: "whatsapp",
        url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1&hash=abc",
        mime_type: "image/jpeg",
        sha256: "deadbeef",
        file_size: 4,
        id: "MEDIA_ID",
      }),
      new Response(bytes, { headers: { "content-type": "image/jpeg" } }),
    );
    const wa = createClient(fetch);

    const media = await wa.downloadMedia("MEDIA_ID");

    expect(Array.from(media.data)).toEqual([1, 2, 3, 4]);
    expect(media).toMatchObject({ mimeType: "image/jpeg", fileSize: 4, sha256: "deadbeef" });
    expect(calls[0]!.url.pathname).toBe("/v25.0/MEDIA_ID");
    expect(calls[1]!.url.host).toBe("lookaside.fbsbx.com");
    expect(calls[1]!.headers.Authorization).toBe("Bearer TEST_TOKEN");
  });

  it("uploads Uint8Array/Buffer data as multipart form data", async () => {
    const { fetch, calls } = mockFetch(json({ id: "NEW_MEDIA" }));
    const res = await createClient(fetch).uploadMedia(new Uint8Array([1, 2]), "image/png", "a.png");

    expect(res.id).toBe("NEW_MEDIA");
    const form = calls[0]!.body as FormData;
    expect(form.get("messaging_product")).toBe("whatsapp");
    expect((form.get("file") as File).name).toBe("a.png");
    expect(calls[0]!.headers["Content-Type"]).toBeUndefined();
  });

  it("uses the OAuth header for the resumable upload step", async () => {
    const { fetch, calls } = mockFetch(json({ id: "upload:SESSION" }), json({ h: "HANDLE" }));
    const res = await createClient(fetch).uploadMediaResumable(new Uint8Array(10), "image/png", "a.png");

    expect(res.handle).toBe("HANDLE");
    expect(calls[0]!.body).toEqual({ file_length: 10, file_type: "image/png", file_name: "a.png" });
    expect(calls[1]!.headers.Authorization).toBe("OAuth TEST_TOKEN");
    expect(calls[1]!.headers.file_offset).toBe("0");
  });
});
