# Sending Messages

All send methods return a `SendMessageResponse`. The message ID (WAMID) is at `res.messages[0].id`. Store it to match delivery [status webhooks](./webhooks#delivery-statuses).

Every send method accepts `{ replyTo, signal, timeoutMs }` as its last argument. `replyTo` quotes an earlier message.

## Text

```ts
await wa.sendText("966500000000", "Hello!");

// Show a link preview, reply to a message
await wa.sendText("966500000000", "Read more: https://example.com", {
  previewUrl: true,
  replyTo: "wamid.HBgM...",
});
```

## Media

Send from a public URL, or from an ID returned by [`uploadMedia`](./media#uploading).

```ts
await wa.sendMedia(to, { type: "image", url: "https://example.com/photo.jpg", caption: "New arrivals" });
await wa.sendMedia(to, { type: "video", id: "1234567890" });
await wa.sendMedia(to, { type: "document", url: "https://example.com/invoice.pdf", filename: "invoice.pdf" });
await wa.sendMedia(to, { type: "audio", id: mediaId, voice: true }); // voice note (OGG/OPUS)
await wa.sendMedia(to, { type: "sticker", url: "https://example.com/sticker.webp" });
```

`caption` is ignored for `audio` and `sticker`. `filename` only applies to `document`.

## Location

```ts
await wa.sendLocation(to, {
  latitude: 24.7136,
  longitude: 46.6753,
  name: "Head Office",
  address: "King Fahd Rd, Riyadh",
});
```

## Contacts

```ts
await wa.sendContacts(to, [
  {
    name: { formatted_name: "Sara Ahmed", first_name: "Sara" },
    phones: [{ phone: "+966500000000", type: "CELL", wa_id: "966500000000" }],
    emails: [{ email: "sara@example.com", type: "WORK" }],
    org: { company: "Acme" },
  },
]);
```

## Reply buttons

Up to 3 buttons. Titles max 20 characters. When the user taps one, you receive an `interactive` webhook with `button_reply.id`.

```ts
await wa.sendInteractiveButtons(to, {
  header: { type: "text", text: "Order #1042" },
  body: "Did your order arrive in good condition?",
  footer: "Reply anytime",
  buttons: [
    { id: "ok", title: "Yes 👍" },
    { id: "issue", title: "There's a problem" },
  ],
});
```

The header can also be an image, video or document: `{ type: "image", image: { link: "https://..." } }`.

## List

A button that opens a menu: up to 10 sections, 10 rows in total. The user's choice arrives as `list_reply.id`.

```ts
await wa.sendInteractiveList(to, {
  header: "Support",
  body: "What do you need help with?",
  buttonText: "Choose topic",
  footer: "Average reply: 2 minutes",
  sections: [
    {
      title: "Orders",
      rows: [
        { id: "track", title: "Track order" },
        { id: "return", title: "Return an item", description: "Within 30 days" },
      ],
    },
    {
      title: "Account",
      rows: [{ id: "agent", title: "Talk to an agent" }],
    },
  ],
});
```

## Call-to-action URL

```ts
await wa.sendCtaUrl(to, {
  body: "Your invoice is ready.",
  buttonText: "View invoice",
  url: "https://example.com/invoices/1042",
});
```

## Reactions

```ts
await wa.sendReaction(to, "wamid.HBgM...", "❤️");
await wa.sendReaction(to, "wamid.HBgM...", ""); // remove reaction
```

## Read receipts and typing indicator

Mark an incoming message as read (blue ticks). Optionally show "typing…" for up to 25 seconds or until you reply:

```ts
await wa.markAsRead(incomingMessageId, { typingIndicator: true });
```

## Anything else

For message types the client doesn't wrap yet, `sendRaw` posts your payload as-is (`messaging_product` and `to` are added):

```ts
await wa.sendRaw(to, {
  type: "interactive",
  interactive: { type: "flow", /* ... */ },
});
```
