# wa-client

[![npm version](https://img.shields.io/npm/v/@osamahalhwawi/wa-client.svg)](https://www.npmjs.com/package/@osamahalhwawi/wa-client)
[![CI](https://github.com/OsamahAlhwawi/wa-client/actions/workflows/ci.yml/badge.svg)](https://github.com/OsamahAlhwawi/wa-client/actions/workflows/ci.yml)
[![License: MPL 2.0](https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg)](https://opensource.org/licenses/MPL-2.0)
![zero dependencies](https://img.shields.io/badge/dependencies-0-blue)

**A typed, zero-dependency client for the WhatsApp Business Cloud API.**
Send messages, manage templates and media, verify and parse webhooks, and onboard customers with Embedded Signup. Works in Node.js 22+, Bun, Deno and edge runtimes.

📖 **[Documentation](https://osamahalhwawi.github.io/wa-client/)**

```ts
import { WhatsAppClient } from "@osamahalhwawi/wa-client";

const wa = new WhatsAppClient({ token: process.env.WA_TOKEN!, phoneId: process.env.WA_PHONE_ID! });

await wa.sendText("966500000000", "Hello from wa-client 👋");
```

## Why wa-client?

- **Fully typed.** Every request, response and webhook event has types, and you get autocomplete for message types, template components and error fields.
- **Webhooks done right.** Constant-time `X-Hub-Signature-256` verification, a verify-token handshake helper, and a parser that turns Meta's nested payload into a flat list of typed events.
- **Production defaults.** Timeouts, `AbortSignal` support, exponential backoff on rate limits (`130429`, `80007`, `131056`, ...) and no double-sending: failed POSTs are never retried blindly.
- **Clear errors.** One `WhatsAppError` class with `code`, `subcode`, `details` and `fbtraceId`. A 502 HTML page from a proxy produces a readable error instead of a `SyntaxError`.
- **Token stays out of URLs.** Every request authenticates with an `Authorization` header, so the token never ends up in access logs.
- **Zero dependencies.** Uses the platform `fetch` and Web Crypto. Bring your own `fetch` if you need a proxy.
- **Embedded Signup helpers** for SaaS platforms onboarding their customers' WhatsApp numbers.

## Installation

```bash
npm install @osamahalhwawi/wa-client
# or
pnpm add @osamahalhwawi/wa-client
yarn add @osamahalhwawi/wa-client
bun add @osamahalhwawi/wa-client
```

Requires Node.js **22+** (or any runtime with `fetch` and Web Crypto). Ships ESM and CommonJS builds.

## Quick start

```ts
import { WhatsAppClient, WhatsAppError } from "@osamahalhwawi/wa-client";

const wa = new WhatsAppClient({
  token: process.env.WA_TOKEN!,     // System user access token
  phoneId: process.env.WA_PHONE_ID!, // Phone Number ID
  wabaId: process.env.WA_WABA_ID,    // Business Account ID (needed for templates)
});

// Text with a reply quote
await wa.sendText("966500000000", "Your order has shipped 📦", { replyTo: "wamid.HBg..." });

// Image from a URL
await wa.sendMedia("966500000000", { type: "image", url: "https://example.com/receipt.png", caption: "Receipt" });

// Interactive list
await wa.sendInteractiveList("966500000000", {
  body: "How can we help?",
  buttonText: "Choose",
  sections: [
    {
      title: "Support",
      rows: [
        { id: "track", title: "Track my order" },
        { id: "agent", title: "Talk to an agent", description: "Avg. reply 2 min" },
      ],
    },
  ],
});

// Template (works outside the 24-hour window)
await wa.sendTemplate("966500000000", {
  name: "order_update",
  language: "en",
  components: [{ type: "body", parameters: [{ type: "text", text: "#1042" }] }],
});
```

## Receiving webhooks

```ts
import express from "express";
import { parseWebhook, verifyWebhookChallenge, verifyWebhookSignature } from "@osamahalhwawi/wa-client";

const app = express();

// 1. Verification handshake (Meta calls this once when you save the webhook URL)
app.get("/webhook", (req, res) => {
  const challenge = verifyWebhookChallenge(req.query, process.env.WA_VERIFY_TOKEN!);
  challenge ? res.send(challenge) : res.sendStatus(403);
});

// 2. Events: keep the RAW body, the signature is computed over the exact bytes
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const valid = await verifyWebhookSignature(req.body, req.get("x-hub-signature-256"), process.env.META_APP_SECRET!);
  if (!valid) return res.sendStatus(401);

  res.sendStatus(200); // acknowledge fast, process after

  for (const event of parseWebhook(JSON.parse(req.body.toString("utf8")))) {
    switch (event.type) {
      case "message":
        if (event.message.type === "text") {
          console.log(`${event.contact?.profile?.name}: ${event.message.text.body}`);
          await wa.markAsRead(event.message.id, { typingIndicator: true });
        }
        if (event.message.type === "image") {
          const file = await wa.downloadMedia(event.message.image.id);
          // file.data is a Uint8Array → save it to disk or S3
        }
        break;
      case "status":
        console.log(event.status.id, event.status.status); // sent / delivered / read / failed
        break;
    }
  }
});
```

## Bulk sending

```ts
const result = await wa.sendTemplateBulk(phones, { name: "promo", language: "ar" }, {
  concurrency: 20,
  components: { "966500000001": [{ type: "body", parameters: [{ type: "text", text: "Sara" }] }] },
  onProgress: (r, done, total) => console.log(`${done}/${total}`, r.success ? r.wamid : r.error),
});

console.log(result.successful, result.failed);
```

Rate-limited sends are retried with exponential backoff and jitter. Each recipient gets exactly one result, in input order.

## Error handling

```ts
try {
  await wa.sendText(to, "Hi");
} catch (err) {
  if (err instanceof WhatsAppError) {
    err.kind;        // "api" | "http" | "network" | "timeout" | "aborted"
    err.code;        // e.g. 131047 → 24-hour window closed, send a template
    err.details;     // Meta's most specific explanation
    err.isRateLimit; // true for 4 / 80007 / 130429 / 131056 / HTTP 429
    err.fbtraceId;   // include this when contacting Meta support
  }
}
```

## Configuration

| Option       | Default                      | Description                                                        |
| ------------ | ---------------------------- | ------------------------------------------------------------------ |
| `token`      | **required**                 | Access token                                                       |
| `phoneId`    | **required**                 | Phone Number ID                                                    |
| `wabaId`     | —                            | WhatsApp Business Account ID (templates, analytics)                |
| `apiVersion` | `"v25.0"`                    | Graph API version                                                  |
| `timeoutMs`  | `30000`                      | Per-request timeout, `0` to disable                                |
| `retry`      | `{ retries: 3, minDelayMs: 500, maxDelayMs: 10000 }` | Backoff policy, or `false` to disable      |
| `fetch`      | `globalThis.fetch`           | Custom fetch (proxies, tests)                                      |
| `logger`     | silent                       | `{ debug?, warn? }`, e.g. `console`. The token is never logged.    |
| `baseUrl`    | `https://graph.facebook.com` | Override for proxies / mock servers                                |

Every method also accepts per-call `{ signal, timeoutMs }`.

## API overview

| Area             | Methods                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Messages         | `sendText` `sendMedia` `sendLocation` `sendContacts` `sendReaction` `sendInteractiveButtons` `sendInteractiveList` `sendCtaUrl` `sendTemplate` `sendTemplateBulk` `markAsRead` `sendRaw` |
| Media            | `uploadMedia` `uploadMediaResumable` `getMediaUrl` `downloadMedia` `deleteMedia`                                                                                          |
| Templates        | `getTemplates` `iterateTemplates` `getTemplate` `getTemplateButtons` `createTemplate` `editTemplate` `deleteTemplate` `getTemplateAnalytics` `enableTemplateInsights`     |
| Phone & profile  | `getBusinessProfile` `updateBusinessProfile` `getDisplayName` `updateDisplayName` `registerPhoneNumber` `getMessagingLimit`                                              |
| QR codes         | `getQRCodes` `getQRCodeImage` `createQRCode` `updateQRCode` `deleteQRCode`                                                                                               |
| Webhooks         | `verifyWebhookSignature` `verifyWebhookChallenge` `parseWebhook` + payload types                                                                                         |
| Embedded Signup  | `exchangeCodeForToken` `subscribeAppToWaba` `getWabaPhoneNumbers` `registerPhoneNumber` `initiateSmbSync` `generatePin`                                                  |

See the **[full documentation](https://osamahalhwawi.github.io/wa-client/)** for every method and option.

## License

[Mozilla Public License 2.0](./LICENSE).

In plain terms (this summary is not legal advice):

- ✅ You can use it in commercial and closed-source products, free of charge.
- ✅ Your own code that *uses* the library stays yours and can stay private.
- 🔁 If you **modify the library's files** and distribute them (including bundled in an app or published as a package), you must make the source of those modified files available under MPL-2.0.

## Disclaimer

This is an independent open-source project. It is not affiliated with, endorsed by, or sponsored by Meta Platforms, Inc. or WhatsApp LLC. "WhatsApp" is a trademark of WhatsApp LLC.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

```bash
npm install
npm test          # unit tests (no network, fetch is mocked)
npm run typecheck
npm run docs:dev  # docs site at http://localhost:5173
```
