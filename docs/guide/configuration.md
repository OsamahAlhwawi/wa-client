# Configuration

```ts
const wa = new WhatsAppClient({
  token: "EAAG...",
  phoneId: "1234567890",
  wabaId: "9876543210",
  apiVersion: "v25.0",
  timeoutMs: 30_000,
  retry: { retries: 3, minDelayMs: 500, maxDelayMs: 10_000 },
  logger: console,
});
```

| Option       | Type                       | Default                      | Description                                                          |
| ------------ | -------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| `token`      | `string`                   | **required**                 | Access token                                                         |
| `phoneId`    | `string`                   | **required**                 | Phone Number ID                                                      |
| `wabaId`     | `string`                   | —                            | WhatsApp Business Account ID. Required for template methods.        |
| `apiVersion` | `string`                   | `"v25.0"`                    | Graph API version                                                    |
| `baseUrl`    | `string`                   | `https://graph.facebook.com` | Override for proxies or mock servers                                 |
| `timeoutMs`  | `number`                   | `30000`                      | Per-request timeout. `0` disables it.                                |
| `retry`      | `RetryOptions \| false`    | see below                    | Backoff policy                                                       |
| `fetch`      | `typeof fetch`             | `globalThis.fetch`           | Custom fetch implementation                                          |
| `logger`     | `WhatsAppLogger`           | silent                       | Receives `debug` (each request) and `warn` (each retry)              |

## Retries

The client retries a request only when retrying is safe:

| Situation                                                       | Retried?                      |
| --------------------------------------------------------------- | ----------------------------- |
| Rate limit: codes `4`, `80007`, `130429`, `131056` or HTTP 429  | ✅ Any method                  |
| 5xx, network error or timeout on **GET**                        | ✅                             |
| 5xx, network error or timeout on **POST/DELETE**                | ❌ The message may already have been sent |
| `131048` (spam rate limit / messaging tier exhausted)           | ❌ Retrying minutes later won't help |
| Any other API error                                             | ❌                             |

Delays grow exponentially (`minDelayMs × 2^attempt`, capped at `maxDelayMs`) with jitter, so parallel requests don't retry in lockstep.

```ts
// Disable retries entirely
new WhatsAppClient({ token, phoneId, retry: false });
```

## Per-call options

Every method accepts `{ signal, timeoutMs }` as its last argument:

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 5_000);

await wa.getTemplates({ signal: controller.signal });
await wa.sendText(to, "hi", { timeoutMs: 5_000 });
```

Aborting also cancels any pending retry delay.

## Logging

Nothing is logged by default. Pass any object with optional `debug` / `warn` methods:

```ts
new WhatsAppClient({ token, phoneId, logger: console });

// pino
const log = pino();
new WhatsAppClient({
  token,
  phoneId,
  logger: {
    debug: (msg, meta) => log.debug(meta, msg),
    warn: (msg, meta) => log.warn(meta, msg),
  },
});
```

The access token is never passed to the logger, and query strings of signed media URLs are stripped.

## Custom fetch

Useful for corporate proxies, tests, or adding tracing:

```ts
import { ProxyAgent, fetch as undiciFetch } from "undici";

const dispatcher = new ProxyAgent("http://proxy.internal:8080");
new WhatsAppClient({
  token,
  phoneId,
  fetch: (url, init) => undiciFetch(url, { ...init, dispatcher }),
});
```

## Security

The access token always travels in the `Authorization` header and never in the URL, so it can't end up in proxy logs, CDN logs or error trackers.
