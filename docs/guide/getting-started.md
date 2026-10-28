# Getting Started

## Installation

::: code-group

```bash [npm]
npm install @osamahalhwawi/wa-client
```

```bash [pnpm]
pnpm add @osamahalhwawi/wa-client
```

```bash [yarn]
yarn add @osamahalhwawi/wa-client
```

```bash [bun]
bun add @osamahalhwawi/wa-client
```

:::

**Requirements:** Node.js 22+, or any runtime with `fetch` and the Web Crypto API (Bun, Deno, Cloudflare Workers, Vercel Edge). Both `import` and `require` work.

## What you need from Meta

| Value               | Where to find it                                                                           | Used for                     |
| ------------------- | ------------------------------------------------------------------------------------------ | ---------------------------- |
| **Access token**    | Business Settings → System users → Generate token (`whatsapp_business_messaging`, `whatsapp_business_management`) | Every API call |
| **Phone Number ID** | App dashboard → WhatsApp → API Setup                                                       | Sending messages, media      |
| **WABA ID**         | App dashboard → WhatsApp → API Setup (WhatsApp Business Account ID)                        | Templates, analytics         |
| **App secret**      | App dashboard → App settings → Basic                                                       | Verifying webhook signatures |

::: tip
Use a **System User** token for production. The temporary token on the API Setup page expires after 24 hours.
:::

## Your first message

```ts
import { WhatsAppClient } from "@osamahalhwawi/wa-client";

const wa = new WhatsAppClient({
  token: process.env.WA_TOKEN!,
  phoneId: process.env.WA_PHONE_ID!,
  wabaId: process.env.WA_WABA_ID, // optional, only needed for templates
});

const res = await wa.sendText("966500000000", "Hello from wa-client 👋");
console.log(res.messages[0].id); // wamid.HBgM...
```

Phone numbers are in international format **without** `+` or leading zeros.

::: warning The 24-hour window
You can only send free-form messages (text, media, interactive) within 24 hours of the user's last message. Outside that window, send a [template](./templates). Otherwise the API returns error `131047`.
:::

## CommonJS

```js
const { WhatsAppClient } = require("@osamahalhwawi/wa-client");
```

## Next steps

- [Configuration](./configuration): timeouts, retries, logging, custom fetch
- [Sending messages](./messages): every message type
- [Webhooks](./webhooks): receive messages and delivery statuses
