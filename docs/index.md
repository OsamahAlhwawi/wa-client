---
layout: home

hero:
  name: wa-client
  text: WhatsApp Cloud API, fully typed
  tagline: Messages, media, templates, webhooks and Embedded Signup in one zero-dependency package.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /reference/api
    - theme: alt
      text: GitHub
      link: https://github.com/OsamahAlhwawi/wa-client

features:
  - icon: 🧩
    title: Fully typed
    details: Every request, response and webhook event is typed. Autocomplete for message types, template components and error codes.
  - icon: 🔐
    title: Secure webhooks
    details: Constant-time X-Hub-Signature-256 verification, verify-token handshake, and a parser that flattens payloads into typed events.
  - icon: 🛡️
    title: Production defaults
    details: Timeouts, AbortSignal, exponential backoff on rate limits, and no blind retries of POSTs, so nothing gets sent twice.
  - icon: 🪶
    title: Zero dependencies
    details: Uses the platform fetch and Web Crypto. Runs on Node.js 22+, Bun, Deno and edge runtimes. ESM + CommonJS.
  - icon: 📦
    title: Bulk sending
    details: Send templates to thousands of recipients with bounded concurrency, per-recipient variables and progress callbacks.
  - icon: 🚀
    title: Embedded Signup
    details: Helpers for SaaS platforms. Exchange codes, subscribe webhooks, register numbers with retry.
---

## At a glance

```ts
import { WhatsAppClient } from "@osamahalhwawi/wa-client";

const wa = new WhatsAppClient({
  token: process.env.WA_TOKEN!,
  phoneId: process.env.WA_PHONE_ID!,
});

await wa.sendText("966500000000", "Hello 👋");
```
