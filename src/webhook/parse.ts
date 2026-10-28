/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { MessagesValue, WebhookEvent, WebhookPayload } from "./types.js";

/**
 * Flatten a webhook payload into a list of typed events.
 *
 * A single POST can batch several entries, changes, messages and statuses —
 * this walks all of them so you can handle each event with a simple switch.
 *
 * @example
 * for (const event of parseWebhook(req.body)) {
 *   if (event.type === "message" && event.message.type === "text") {
 *     console.log(event.contact?.profile?.name, event.message.text.body);
 *   }
 * }
 */
export function parseWebhook(payload: WebhookPayload | unknown): WebhookEvent[] {
  const events: WebhookEvent[] = [];
  if (!isRecord(payload) || !Array.isArray(payload.entry)) return events;

  for (const entry of payload.entry as WebhookPayload["entry"]) {
    const wabaId = entry.id;

    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") {
        events.push({ type: "other", wabaId, field: change.field, value: change.value as Record<string, unknown> });
        continue;
      }

      const value = change.value as MessagesValue;
      const metadata = value.metadata;

      for (const message of value.messages ?? []) {
        const contact = value.contacts?.find((c) => c.wa_id === message.from) ?? value.contacts?.[0];
        events.push({ type: "message", wabaId, message, metadata, ...(contact && { contact }) });
      }
      for (const status of value.statuses ?? []) {
        events.push({ type: "status", wabaId, status, metadata });
      }
      for (const error of value.errors ?? []) {
        events.push({ type: "error", wabaId, error, metadata });
      }
    }
  }

  return events;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
