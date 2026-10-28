# Embedded Signup

If you build a platform where **your customers connect their own WhatsApp numbers** (as a Tech Provider or Solution Partner), Meta's [Embedded Signup](https://developers.facebook.com/docs/whatsapp/embedded-signup) popup gives you a short-lived `code` plus the customer's WABA ID and phone number ID. These helpers cover the server side of that flow.

All helpers are standalone functions. They take the token as an argument and accept the same `apiVersion`, `fetch`, `timeoutMs`, `signal` and `logger` options as the client.

## Full flow

```ts
import {
  WhatsAppClient,
  exchangeCodeForToken,
  subscribeAppToWaba,
  getWabaPhoneNumbers,
  registerPhoneNumber,
  generatePin,
} from "@osamahalhwawi/wa-client";

// `code`, `wabaId` and (usually) `phoneId` come from the Embedded Signup popup in your frontend
export async function onboard(code: string, wabaId: string, phoneId?: string) {
  // 1. Exchange the code (valid ~30 seconds) for a long-lived business token
  const { accessToken } = await exchangeCodeForToken({
    appId: process.env.META_APP_ID!,
    appSecret: process.env.META_APP_SECRET!,
    code,
  });

  // 2. Subscribe your app to the WABA's webhooks, or you won't receive messages
  await subscribeAppToWaba(wabaId, accessToken);

  // 3. Coexistence flow returns only the WABA, so look up the phone number
  phoneId ??= (await getWabaPhoneNumbers(wabaId, accessToken))[0]?.id;
  if (!phoneId) throw new Error("No phone number on this WABA");

  // 4. Register the number for Cloud API (retries up to 3 times, 60s each)
  const pin = generatePin();
  await registerPhoneNumber(phoneId, accessToken, pin);

  // 5. Store the token encrypted, plus the pin (needed to re-register later)
  await saveCustomer({ wabaId, phoneId, accessToken: encrypt(accessToken), pin: encrypt(pin) });

  return new WhatsAppClient({ token: accessToken, phoneId, wabaId });
}
```

::: warning Keep secrets on the server
`exchangeCodeForToken` needs your **App Secret**. Only call it from your backend, never from the browser.
:::

## `registerPhoneNumber`

```ts
const { attempts } = await registerPhoneNumber(phoneId, token, pin, {
  attempts: 3,             // default 3
  attemptTimeoutMs: 60_000, // default 60s per attempt
  backoffMs: 2_000,        // default 2s, grows linearly
});
```

Success requires HTTP 2xx **and** `success: true` in the body. On failure it throws a `WhatsAppError` whose `body.attempts` contains every raw response, which is handy to show in an admin UI for diagnosis.

## `initiateSmbSync` (coexistence)

When a customer keeps using the WhatsApp Business **app** alongside the API, you can import their contacts and up to 6 months of history once:

```ts
await initiateSmbSync(phoneId, token, "smb_app_state_sync"); // contacts
await initiateSmbSync(phoneId, token, "history");            // conversations
// → { requestId: "...", alreadyRequested: false }
```

The sync can only be triggered once per number. Repeat calls resolve with `{ alreadyRequested: true }` instead of throwing. The data then arrives through your webhook.

## `subscribeAppToWaba` with a custom callback

To route one customer's webhooks to a different URL:

```ts
await subscribeAppToWaba(wabaId, token, {
  overrideCallbackUri: "https://hooks.example.com/wa/customer-42",
  verifyToken: "secret-for-this-url",
});
```
