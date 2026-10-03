import { after } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createAutomation } from "@/lib/automation";
import { getAccount } from "@/lib/accounts";
import { parseKeywords } from "@/lib/keywords";
import { deleteMedia, saveUpload, type SavedMedia } from "@/lib/media";
import { adapter } from "@/lib/platforms";
import { createPost, publishPost } from "@/lib/publisher";
import type { Platform } from "@/lib/types";

function parseLink(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw new Error("That link isn't a valid web address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Links must start with http or https.");
  return url.toString();
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  let media: SavedMedia | null = null;
  try {
    const form = await request.formData();
    const text = (key: string) => String(form.get(key) ?? "");
    const accountIds = form.getAll("accountIds").map(String);
    const scheduledRaw = text("scheduledAt");
    const scheduledAt = scheduledRaw ? Date.parse(scheduledRaw) : null;
    if (scheduledAt !== null && Number.isNaN(scheduledAt)) throw new Error("The schedule time is not valid.");
    if (scheduledAt !== null && scheduledAt < Date.now() - 60_000)
      throw new Error("The schedule time is in the past. Pick a future time or choose Post now.");

    const file = form.get("file");
    if (file instanceof File && file.size > 0) media = await saveUpload(file);
    const caption = text("caption");
    if (!caption.trim() && !media) throw new Error("Add a caption or a file.");

    const link = parseLink(text("link"));
    const postId = createPost({
      title: text("title").trim(),
      caption,
      link,
      linkInCaption: text("linkInCaption") === "1",
      media,
      accountIds,
      scheduledAt: scheduledAt && scheduledAt > Date.now() ? scheduledAt : null,
    });

    // Optional keyword automation for just this post (the ManyChat-style "comment GUIDE to get the link").
    const keywords = parseKeywords(text("autoKeywords"));
    const dm = text("autoDm");
    const reply = text("autoReply");
    if (keywords.length && (dm.trim() || reply.trim())) {
      // Only platforms whose comments the app can see (not TikTok).
      const platforms = [
        ...new Set(accountIds.map((id) => getAccount(id)?.platform).filter((p): p is Platform => Boolean(p))),
      ].filter((p) => adapter(p).capabilities.commentSource !== "none");
      if (platforms.length) createAutomation({
        name: `Post keyword: ${keywords.join(", ")}`,
        postId,
        platforms,
        keywords,
        matchMode: "contains",
        publicReply: reply,
        dmMessage: dm,
        includeLink: true,
      });
    }

    if (!scheduledAt || scheduledAt <= Date.now()) after(() => publishPost(postId));
    return Response.json({ id: postId });
  } catch (err) {
    if (media) deleteMedia(media.file);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
