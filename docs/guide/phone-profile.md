# Phone Number & Profile

These methods manage the phone number your client is bound to (`phoneId`): what customers see when they open your chat, the name shown at the top, QR codes that start a conversation, and how many people you can message per day.

## Business profile

The profile is the info card customers see when they tap your business name in WhatsApp.

```ts
const profile = await wa.getBusinessProfile();
// {
//   about: "Open 9am–5pm",
//   address: "...",
//   description: "...",
//   email: "hello@example.com",
//   websites: ["https://example.com"],
//   vertical: "RETAIL",
//   profile_picture_url: "https://..."
// }
```

Every field is optional, and fields that were never set are missing from the response.

### Updating

Send only the fields you want to change. The others stay as they are.

```ts
await wa.updateBusinessProfile({
  about: "Open 9am–5pm, Sun–Thu",
  websites: ["https://example.com", "https://shop.example.com"],
  vertical: "RETAIL",
});
```

| Field         | Notes                                                                 |
| ------------- | --------------------------------------------------------------------- |
| `about`       | Short status line under the name                                      |
| `address`     | Free-text address                                                     |
| `description` | Longer description of the business                                    |
| `email`       | Contact email                                                         |
| `websites`    | Up to 2 URLs, each including `http://` or `https://`                  |
| `vertical`    | Industry, e.g. `"RETAIL"`, `"RESTAURANT"`, `"EDU"`. Fully typed as `BusinessVertical` |
| `profile_picture_handle` | See below                                                  |

Meta enforces length limits on the text fields. If a value is too long, the call throws a `WhatsAppError` whose `details` names the field.

### Profile picture

The profile picture isn't sent as a URL. Upload the image with the resumable upload API first, then pass the returned handle:

```ts
import { readFile } from "node:fs/promises";

const image = await readFile("logo.jpg");
const { handle } = await wa.uploadMediaResumable(image, "image/jpeg", "logo.jpg");

await wa.updateBusinessProfile({ profile_picture_handle: handle });
```

Use a square JPEG or PNG. The new picture can take a little while to show up in WhatsApp.

## Display name

The display name is the business name shown at the top of the chat. Changing it goes through review by Meta.

```ts
const info = await wa.getDisplayName();
// {
//   id: "1234567890",
//   verified_name: "Acme Store",          // current name
//   name_status: "APPROVED",
//   display_phone_number: "+1 555-0100",
//   new_display_name: "Acme",             // pending change, if any
//   new_name_status: "PENDING_REVIEW",
//   quality_rating: "GREEN"               // GREEN | YELLOW | RED | NA
// }
```

`quality_rating` reflects how recipients have responded to your recent messages (blocks, reports). A `RED` rating puts the number at risk of a lower messaging limit, so it's worth monitoring.

### Changing the name

```ts
await wa.updateDisplayName("Acme");
```

This only **submits** the name for review. Poll `getDisplayName()` and watch `new_name_status`. Once it's approved, re-register the number so the new name takes effect:

```ts
const { new_name_status } = await wa.getDisplayName();

if (new_name_status === "APPROVED") {
  await wa.registerPhoneNumber(pin);
}
```

## Registering the number

A phone number must be registered before it can send or receive messages through the Cloud API.

```ts
await wa.registerPhoneNumber("123456");
```

The `pin` is the number's 6-digit **two-step verification PIN**:

- If the number has no PIN yet, the one you pass becomes its PIN.
- If it already has one, you must pass that same PIN. Otherwise the call fails.

Store the PIN securely. You need it again whenever you re-register (for example after a display name change).

::: tip Onboarding customers' numbers?
For Embedded Signup there's a standalone `registerPhoneNumber(phoneId, token, pin)` helper that retries with longer timeouts, plus `generatePin()`. See [Embedded Signup](./embedded-signup).
:::

Meta rate-limits registration attempts per number, so don't call this in a loop.

## Messaging limit

The messaging limit is the number of **unique customers** you can start conversations with (using templates) in a rolling 24-hour window. Replies inside an open customer-service window don't count.

```ts
const tier = await wa.getMessagingLimit();
// "TIER_250" | "TIER_1K" | "TIER_10K" | "TIER_100K" | "TIER_UNLIMITED"
```

If Meta doesn't return a tier (common for new numbers), the method returns `"TIER_250"`, the starting limit.

Check this before a big bulk send. When you hit the limit, sends fail with error code `131048` and are **not** retried automatically, because retrying won't help until the window resets:

```ts
const limits: Record<string, number> = {
  TIER_250: 250,
  TIER_1K: 1_000,
  TIER_10K: 10_000,
  TIER_100K: 100_000,
};

const tier = await wa.getMessagingLimit();
const max = limits[tier] ?? Infinity;

if (recipients.length > max) {
  console.warn(`Only ${max} new conversations allowed per 24h on ${tier}`);
}
```

Meta raises the tier automatically as you send good-quality messages to more customers.

## QR codes

QR codes (and their matching short links) open a chat with your number with a message already typed in. They're useful on packaging, receipts, posters or a website.

### Creating

```ts
const qr = await wa.createQRCode("Hi! I'd like to know more about your offers");
// {
//   code: "4O4YGZEG3RIVE1",
//   prefilled_message: "Hi! I'd like to know more about your offers",
//   deep_link_url: "https://wa.me/message/4O4YGZEG3RIVE1",
//   qr_image_url: "https://..."   // PNG
// }
```

- `deep_link_url` is a link you can share directly. It opens the same chat as the QR code.
- `qr_image_url` points to a PNG image of the QR code. Download it if you need to keep it.

### Listing and fetching

```ts
const all = await wa.getQRCodes();
// [{ code, prefilled_message, deep_link_url }, ...]

const pngUrl = await wa.getQRCodeImage("4O4YGZEG3RIVE1");
// string, or null if the code doesn't exist
```

`getQRCodes()` doesn't include image URLs. Call `getQRCodeImage(code)` for the one you want to display.

### Updating and deleting

```ts
await wa.updateQRCode("4O4YGZEG3RIVE1", "Hi! I have a question about my order");
await wa.deleteQRCode("4O4YGZEG3RIVE1");
```

Updating keeps the same `code`, so QR codes you've already printed keep working and use the new message. Deleting makes them stop working.

## Request options

Like every client method, these accept an optional last argument for a per-call timeout or abort signal (see [Per-call options](./configuration#per-call-options)):

```ts
await wa.getBusinessProfile({ timeoutMs: 5_000 });
```
