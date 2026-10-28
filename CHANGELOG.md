# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org/).

## 0.1.1

- Published from GitHub Actions via npm Trusted Publishing, with [provenance](https://docs.npmjs.com/generating-provenance-statements) attesting the package was built from this repository.

## 0.1.0 — Initial release

- `WhatsAppClient` for messages (text, media, location, contacts, reactions, interactive buttons/list/CTA, templates), read receipts with typing indicator, bulk template sending with bounded concurrency.
- Media upload (direct and resumable), URL lookup, download and delete.
- Templates CRUD with automatic pagination, analytics and insights.
- Business profile, display name, QR codes, messaging limit.
- Webhooks: `verifyWebhookSignature` (X-Hub-Signature-256), `verifyWebhookChallenge`, `parseWebhook` and full payload types.
- Embedded Signup helpers: code exchange, app subscription, phone registration with retry, SMB sync.
- Timeouts, `AbortSignal`, custom `fetch`, optional logger, exponential backoff on rate limits.
- Default Graph API version: v25.0.
