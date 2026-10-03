import crypto from "node:crypto";
import type { IncomingComment } from "./types";

/** Checks Meta's X-Hub-Signature-256 header against any of the configured app secrets. */
export function verifyMetaSignature(rawBody: string, header: string | null, secrets: (string | undefined)[]): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const given = Buffer.from(header.slice(7), "hex");
  return secrets.some((secret) => {
    if (!secret) return false;
    const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest();
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  });
}

interface MetaChange {
  field?: string;
  value?: Record<string, unknown>;
}

interface MetaPayload {
  object?: string;
  entry?: { id?: string; changes?: MetaChange[] }[];
}

/** Turns an Instagram or Facebook Page webhook payload into new-comment events. */
export function parseMetaComments(payload: MetaPayload): IncomingComment[] {
  const out: IncomingComment[] = [];
  for (const entry of payload.entry ?? []) {
    const accountId = String(entry.id ?? "");
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      if (payload.object === "instagram" && change.field === "comments") {
        const from = (v.from ?? {}) as { id?: string; username?: string };
        const media = (v.media ?? {}) as { id?: string };
        if (!v.id || typeof v.text !== "string") continue;
        out.push({
          platform: "instagram",
          accountExternalId: accountId,
          commentId: String(v.id),
          postExternalId: media.id ?? null,
          authorId: from.id ?? null,
          authorName: from.username ?? null,
          text: v.text,
        });
      }
      if (payload.object === "page" && change.field === "feed" && v.item === "comment" && v.verb === "add") {
        const from = (v.from ?? {}) as { id?: string; name?: string };
        if (!v.comment_id || typeof v.message !== "string") continue;
        out.push({
          platform: "facebook",
          accountExternalId: accountId,
          commentId: String(v.comment_id),
          postExternalId: typeof v.post_id === "string" ? v.post_id : null,
          authorId: from.id ?? null,
          authorName: from.name ?? null,
          text: v.message,
        });
      }
    }
  }
  return out;
}
