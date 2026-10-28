# Error Handling

Every failure is a `WhatsAppError`. There are no bare `SyntaxError`s from HTML error pages, and no plain `TypeError: fetch failed`.

```ts
import { WhatsAppError } from "@osamahalhwawi/wa-client";

try {
  await wa.sendText(to, "Hello");
} catch (err) {
  if (!(err instanceof WhatsAppError)) throw err;

  switch (err.code) {
    case 131047: // more than 24h since the user's last message
      await wa.sendTemplate(to, { name: "follow_up", language: "en" });
      break;
    case 131026: // recipient is not on WhatsApp / can't receive
      await markInvalid(to);
      break;
    default:
      console.error(err.message, err.details, err.fbtraceId);
  }
}
```

## Properties

| Property      | Description                                                                    |
| ------------- | ------------------------------------------------------------------------------ |
| `kind`        | `"api"`, `"http"`, `"network"`, `"timeout"` or `"aborted"`                     |
| `status`      | HTTP status (`0` if no response was received)                                  |
| `code`        | Graph API error code                                                           |
| `subcode`     | Graph API error subcode                                                        |
| `type`        | Graph API error type, e.g. `OAuthException`                                    |
| `message`     | `error_user_msg` if Meta provided one, otherwise `message`                     |
| `userTitle`   | `error_user_title`                                                             |
| `details`     | `error_data.details`, often the most useful explanation                        |
| `isTransient` | Meta's hint that retrying may succeed                                          |
| `fbtraceId`   | Include this when contacting Meta support                                      |
| `body`        | Raw response body (parsed JSON, or the first 1000 characters of text)          |
| `isRateLimit` | `true` for codes `4`, `80007`, `130429`, `131056` or HTTP 429                  |
| `cause`       | The underlying error for `network` / `timeout` failures                        |

## Kinds

| Kind      | Meaning                                                                   |
| --------- | ------------------------------------------------------------------------- |
| `api`     | Meta returned a structured error. `code` is set.                          |
| `http`    | Non-2xx without a Graph error body (e.g. a 502 HTML page), or a 200 with a non-JSON body |
| `network` | No response: DNS failure, connection reset, ...                           |
| `timeout` | The request exceeded `timeoutMs`                                          |
| `aborted` | Your `AbortSignal` fired                                                  |

## Common error codes

| Code     | Meaning                                                  | What to do                                      |
| -------- | -------------------------------------------------------- | ----------------------------------------------- |
| `0`      | Auth exception                                           | Token is invalid or expired                     |
| `100`    | Invalid parameter                                        | Check `details`                                 |
| `130429` | Throughput limit reached                                 | Retried automatically                           |
| `131026` | Message undeliverable                                    | Number not on WhatsApp, or old app version      |
| `131047` | Re-engagement required (24h window closed)               | Send a template                                 |
| `131048` | Spam rate limit / messaging tier reached                 | Wait (often until the next day) or raise your tier |
| `131051` | Unsupported message type                                 |                                                 |
| `131056` | Too many messages to the same user                       | Retried automatically                           |
| `132000` | Template parameter count mismatch                        | Check `components`                              |
| `132001` | Template doesn't exist in that language                  | Check `name` / `language`                       |
| `133010` | Phone number not registered                              | Call `registerPhoneNumber`                      |

The full list is in [Meta's error code reference](https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes).
