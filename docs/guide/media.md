# Media

## Downloading received media

Incoming image, video, audio, document and sticker messages carry a **media ID**, not a file. `downloadMedia` looks up the temporary URL and downloads the bytes in one call:

```ts
import { writeFile } from "node:fs/promises";

if (event.message.type === "image") {
  const file = await wa.downloadMedia(event.message.image.id);

  file.data;     // Uint8Array
  file.mimeType; // "image/jpeg"
  file.fileSize; // bytes
  file.sha256;   // checksum from Meta

  await writeFile("photo.jpg", file.data);
}
```

If you only need the URL (e.g. to stream it yourself):

```ts
const info = await wa.getMediaUrl(mediaId);
// info.url expires after ~5 minutes and requires the Authorization header
```

::: warning
Media URLs require your access token and expire quickly. Don't store them or send them to browsers. Download the file and store it yourself (S3, R2, disk).
:::

## Uploading

`uploadMedia` returns a media ID you can send any number of times for 30 days. It accepts a `Blob`/`File`, `ArrayBuffer`, `Uint8Array` or Node.js `Buffer`.

```ts
import { readFile } from "node:fs/promises";

const { id } = await wa.uploadMedia(await readFile("menu.pdf"), "application/pdf", "menu.pdf");
await wa.sendMedia(to, { type: "document", id, filename: "menu.pdf" });
```

## Uploading for templates (resumable)

Template headers with media, and profile pictures, need an **asset handle** rather than a media ID:

```ts
const { handle } = await wa.uploadMediaResumable(imageBytes, "image/png", "header.png");

await wa.createTemplate({
  name: "new_collection",
  language: "en",
  category: "MARKETING",
  components: [
    { type: "HEADER", format: "IMAGE", example: { header_handle: [handle] } },
    { type: "BODY", text: "Our new collection is here!" },
  ],
});

// or
await wa.updateBusinessProfile({ profile_picture_handle: handle });
```

## Deleting

```ts
await wa.deleteMedia(mediaId);
```
