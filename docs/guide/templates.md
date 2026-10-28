# Templates & Bulk Sending

Templates are pre-approved messages. They're the only way to start a conversation, or to message someone more than 24 hours after their last message. Template methods need `wabaId` in the client config.

## Sending a template

```ts
await wa.sendTemplate("966500000000", {
  name: "order_shipped",
  language: "ar",
  components: [
    {
      type: "header",
      parameters: [{ type: "image", image: { link: "https://example.com/box.png" } }],
    },
    {
      type: "body",
      parameters: [
        { type: "text", text: "Sara" },
        { type: "text", text: "#1042" },
      ],
    },
    {
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: "1042" }], // appended to the button's URL
    },
  ],
});
```

For templates created with named parameters, add `parameter_name` to each body parameter.

## Bulk sending

`sendTemplateBulk` sends to many recipients with bounded concurrency. It never throws for individual failures. Inspect the results instead.

```ts
const result = await wa.sendTemplateBulk(
  ["966500000001", "966500000002", "966500000003"],
  { name: "weekly_offer", language: "en" },
  {
    concurrency: 20,
    // Per-recipient variables (Map or plain object, keyed by phone)
    components: {
      "966500000001": [{ type: "body", parameters: [{ type: "text", text: "Sara" }] }],
      "966500000002": [{ type: "body", parameters: [{ type: "text", text: "Ali" }] }],
    },
    onProgress: (item, done, total) => console.log(`${done}/${total}`),
  },
);

result.total;      // 3
result.successful; // 2
result.failed;     // 1
result.results;    // one entry per recipient, same order as the input
// { phone: "966500000003", success: false, error: "...", errorCode: 131026 }
```

**Rate limits:** when Meta answers with a throughput error (`130429`, `80007`, ...), that recipient is retried with exponential backoff and jitter, according to the client's [`retry`](./configuration#retries) setting. Lower `concurrency` if you keep hitting limits on a new number.

Pass `signal` to cancel a running bulk send. Recipients that haven't been sent yet are reported as failed with an "aborted" error.

## Listing templates

`getTemplates` follows every page automatically (Meta returns 25 per page by default; this client requests 100):

```ts
const all = await wa.getTemplates();
const approved = await wa.getTemplates({ status: ["APPROVED"], category: "MARKETING" });
```

For very large accounts, stream them instead of loading everything into memory:

```ts
for await (const template of wa.iterateTemplates({ pageSize: 250 })) {
  console.log(template.name, template.language, template.status);
}
```

| Option     | Description                                                  |
| ---------- | ------------------------------------------------------------ |
| `status`   | `TemplateStatus[]`, e.g. `["APPROVED", "PENDING"]`           |
| `category` | `MARKETING` / `UTILITY` / `AUTHENTICATION`                    |
| `name`     | Filter by name                                               |
| `language` | Filter by language code                                      |
| `fields`   | Graph fields to request                                      |
| `pageSize` | Page size requested from Meta (default 100)                  |
| `maxPages` | Stop after N pages                                           |

Other lookups:

```ts
const t = await wa.getTemplate("order_shipped", "ar"); // exact name + language, or null
const buttons = await wa.getTemplateButtons();          // [{ templateName, buttons: ["Yes", "No"] }]
```

## Creating, editing, deleting

```ts
const created = await wa.createTemplate({
  name: "order_shipped",
  language: "en",
  category: "UTILITY",
  components: [
    { type: "BODY", text: "Hi {{1}}, order {{2}} is on its way!", example: { body_text: [["Sara", "#1042"]] } },
    { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Track" }] },
  ],
});
// { id, status: "PENDING", category }

await wa.editTemplate(created.id, { components: [/* ... */] }); // once per 24h
await wa.deleteTemplate("order_shipped");                         // all languages
await wa.deleteTemplate("order_shipped", { templateId: created.id }); // one language
```

## Analytics

```ts
await wa.enableTemplateInsights(); // once per WABA

const stats = await wa.getTemplateAnalytics({
  templateIds: ["1234567890"],
  start: new Date("2026-10-01"),
  end: new Date("2026-10-28"),
  granularity: "DAILY",
});
```
