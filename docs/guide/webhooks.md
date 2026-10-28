# Webhooks

Meta delivers incoming messages and delivery statuses by POSTing to your webhook URL. wa-client gives you three building blocks:

| Function                 | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `verifyWebhookChallenge` | Answer Meta's one-time GET verification handshake             |
| `verifyWebhookSignature` | Prove a POST really came from Meta (`X-Hub-Signature-256`)    |
| `parseWebhook`           | Flatten the nested payload into a list of typed events         |

## Why verify the signature?

Your webhook URL is public. Without verification, anyone who finds it can POST fake "incoming messages" and trigger your automations, mark fake orders as paid, or flood your database. Meta signs every request with HMAC-SHA256 over the **raw body** using your **App Secret**. `verifyWebhookSignature` recomputes it and compares it in constant time.

::: danger Use the raw body
The signature covers the exact bytes Meta sent. If your framework has already parsed the JSON, re-serializing it will **not** match (key order, whitespace, unicode escaping). Configure your route to give you the raw body, as shown below.
:::

## Express

```ts
import express from "express";
import { WhatsAppClient, parseWebhook, verifyWebhookChallenge, verifyWebhookSignature } from "@osamahalhwawi/wa-client";

const app = express();
const wa = new WhatsAppClient({ token: process.env.WA_TOKEN!, phoneId: process.env.WA_PHONE_ID! });

app.get("/webhook", (req, res) => {
  const challenge = verifyWebhookChallenge(req.query, process.env.WA_VERIFY_TOKEN!);
  challenge ? res.send(challenge) : res.sendStatus(403);
});

app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const ok = await verifyWebhookSignature(req.body, req.get("x-hub-signature-256"), process.env.META_APP_SECRET!);
  if (!ok) return res.sendStatus(401);

  res.sendStatus(200); // reply fast. Meta retries if you take too long.

  for (const event of parseWebhook(JSON.parse(req.body.toString("utf8")))) {
    await handle(event);
  }
});
```

## Fastify

```ts
fastify.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));

fastify.post("/webhook", async (req, reply) => {
  const raw = req.body as Buffer;
  if (!(await verifyWebhookSignature(raw, req.headers["x-hub-signature-256"] as string, APP_SECRET))) {
    return reply.code(401).send();
  }
  reply.send();
  for (const event of parseWebhook(JSON.parse(raw.toString("utf8")))) await handle(event);
});
```

## Next.js (App Router), Hono, Cloudflare Workers, Bun

Anything built on the standard `Request` works the same way:

```ts
export async function POST(request: Request) {
  const raw = await request.text();
  const ok = await verifyWebhookSignature(raw, request.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET!);
  if (!ok) return new Response(null, { status: 401 });

  for (const event of parseWebhook(JSON.parse(raw))) await handle(event);
  return new Response(null, { status: 200 });
}

export async function GET(request: Request) {
  const challenge = verifyWebhookChallenge(new URL(request.url).searchParams, process.env.WA_VERIFY_TOKEN!);
  return challenge ? new Response(challenge) : new Response(null, { status: 403 });
}
```

## Handling events

`parseWebhook` returns a `WebhookEvent[]`. Use `event.type`, then `event.message.type`, and TypeScript narrows everything for you:

```ts
import type { WebhookEvent } from "@osamahalhwawi/wa-client";

async function handle(event: WebhookEvent) {
  switch (event.type) {
    case "message": {
      const { message, contact } = event;
      const name = contact?.profile?.name;

      switch (message.type) {
        case "text":
          console.log(`${name}: ${message.text.body}`);
          break;
        case "image": {
          const file = await wa.downloadMedia(message.image.id); // same for video/audio/document/sticker
          console.log(file.mimeType, file.fileSize, message.image.caption);
          break;
        }
        case "interactive":
          if (message.interactive.type === "button_reply") console.log(message.interactive.button_reply.id);
          if (message.interactive.type === "list_reply") console.log(message.interactive.list_reply.id);
          break;
        case "button": // quick reply on a template
          console.log(message.button.payload);
          break;
        case "location":
          console.log(message.location.latitude, message.location.longitude);
          break;
        case "reaction":
          console.log(message.reaction.emoji ?? "(removed)", "on", message.reaction.message_id);
          break;
      }

      await wa.markAsRead(message.id);
      break;
    }

    case "status":
      // sent → delivered → read, or failed
      console.log(event.status.id, event.status.status, event.status.errors?.[0]?.code);
      break;

    case "error":
      console.error(event.error.code, event.error.title);
      break;

    case "other":
      // account_update, message_template_status_update, ...
      console.log(event.field, event.value);
      break;
  }
}
```

### Event shapes

| `type`    | Fields                                                    |
| --------- | --------------------------------------------------------- |
| `message` | `message: IncomingMessage`, `contact?`, `metadata`, `wabaId` |
| `status`  | `status: MessageStatusUpdate`, `metadata`, `wabaId`       |
| `error`   | `error: WebhookError`, `metadata`, `wabaId`               |
| `other`   | `field: string`, `value`, `wabaId`                        |

`metadata.phone_number_id` tells you which of your numbers received the event. That's useful when one webhook URL serves many numbers.

## Delivery statuses

Match `event.status.id` against the WAMID returned by your send call:

```ts
const res = await wa.sendText(to, "Hi");
await db.messages.insert({ wamid: res.messages[0].id, status: "sending" });

// later, in the webhook
if (event.type === "status") {
  await db.messages.update({ wamid: event.status.id }, { status: event.status.status });
}
```

## Good practices

- **Reply 200 quickly**, then process (or push to a queue). Meta retries slow or failed deliveries, which leads to duplicates.
- **Deduplicate by message ID.** Meta may deliver the same event more than once.
- Statuses can arrive **out of order** (`read` before `delivered`). Never move a status backwards.
