import { credentialsFor, getAccount } from "./accounts";
import { captionFor } from "./captions";
import { randomId } from "./crypto";
import { all, get, run } from "./db";
import { deleteMedia, type SavedMedia } from "./media";
import { adapter } from "./platforms";
import { PLATFORM_LABELS, type AccountRow, type MediaType, type Platform, type PostRow, type PostTargetRow } from "./types";

export interface NewPost {
  title: string;
  caption: string;
  link: string | null;
  linkInCaption: boolean;
  media: SavedMedia | null;
  accountIds: string[];
  scheduledAt: number | null;
}

export function supportsMedia(platform: Platform, media: MediaType): boolean {
  const caps = adapter(platform).capabilities;
  return media === "none" ? caps.text : caps[media];
}

export function createPost(input: NewPost): string {
  const accounts = input.accountIds
    .map((id) => getAccount(id))
    .filter((a): a is AccountRow => Boolean(a));
  if (!accounts.length) throw new Error("Pick at least one connected account.");

  const id = randomId(12);
  run(
    `INSERT INTO posts (id, title, caption, link, link_in_caption, media_file, media_type, media_mime, media_size, status, scheduled_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.title,
    input.caption,
    input.link,
    input.linkInCaption ? 1 : 0,
    input.media?.file ?? null,
    input.media?.type ?? "none",
    input.media?.mime ?? null,
    input.media?.size ?? null,
    input.scheduledAt ? "scheduled" : "publishing",
    input.scheduledAt,
    Date.now(),
  );
  for (const account of accounts) {
    run(
      "INSERT INTO post_targets (id, post_id, account_id, platform, status) VALUES (?, ?, ?, ?, 'pending')",
      randomId(12),
      id,
      account.id,
      account.platform,
    );
  }
  return id;
}

export function getPost(id: string): PostRow | undefined {
  return get<PostRow>("SELECT * FROM posts WHERE id = ?", id);
}

export type PostWithTargets = PostRow & { targets: (PostTargetRow & { username: string })[] };

export function listPosts(limit = 50): PostWithTargets[] {
  const posts = all<PostRow>("SELECT * FROM posts ORDER BY created_at DESC LIMIT ?", limit);
  return posts.map((p) => ({
    ...p,
    targets: all<PostTargetRow & { username: string }>(
      `SELECT t.*, a.username FROM post_targets t JOIN accounts a ON a.id = t.account_id
       WHERE t.post_id = ? ORDER BY t.platform`,
      p.id,
    ),
  }));
}

export function deletePost(id: string): void {
  const post = getPost(id);
  if (!post) return;
  run("DELETE FROM posts WHERE id = ?", id);
  deleteMedia(post.media_file);
}

async function publishTarget(post: PostRow, target: PostTargetRow): Promise<void> {
  run("UPDATE post_targets SET status = 'publishing', error = NULL WHERE id = ?", target.id);
  try {
    const account = getAccount(target.account_id);
    if (!account) throw new Error("The account was disconnected.");
    if (!supportsMedia(account.platform, post.media_type))
      throw new Error(
        post.media_type === "none"
          ? `${PLATFORM_LABELS[account.platform]} needs an image or a video.`
          : `${PLATFORM_LABELS[account.platform]} doesn't accept ${post.media_type} posts.`,
      );

    let result: { externalId: string; url?: string | null };
    if (account.demo) {
      await new Promise((r) => setTimeout(r, 400));
      result = { externalId: `demo-${randomId(6)}`, url: null };
    } else {
      const creds = await credentialsFor(account);
      const text = captionFor(account.platform, {
        title: post.title,
        caption: post.caption,
        link: post.link,
        linkInCaption: Boolean(post.link_in_caption),
      });
      result = await adapter(account.platform).publish(creds, { post, text });
    }
    run(
      "UPDATE post_targets SET status = 'published', external_id = ?, external_url = ?, published_at = ? WHERE id = ?",
      result.externalId,
      result.url ?? null,
      Date.now(),
      target.id,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    run("UPDATE post_targets SET status = 'failed', error = ? WHERE id = ?", message.slice(0, 1000), target.id);
  }
}

const inFlight = new Set<string>();

/** Publishes every target of a post that isn't already live. Safe to call again to retry failures. */
export async function publishPost(postId: string): Promise<void> {
  if (inFlight.has(postId)) return;
  const post = getPost(postId);
  if (!post) return;
  inFlight.add(postId);
  try {
    run("UPDATE posts SET status = 'publishing' WHERE id = ?", postId);
    const targets = all<PostTargetRow>(
      "SELECT * FROM post_targets WHERE post_id = ? AND status != 'published'",
      postId,
    );
    await Promise.allSettled(targets.map((t) => publishTarget(post, t)));

    const statuses = all<{ status: string }>("SELECT status FROM post_targets WHERE post_id = ?", postId);
    const ok = statuses.filter((s) => s.status === "published").length;
    const status = ok === statuses.length ? "published" : ok === 0 ? "failed" : "partial";
    run("UPDATE posts SET status = ? WHERE id = ?", status, postId);
  } finally {
    inFlight.delete(postId);
  }
}

export async function publishDuePosts(): Promise<number> {
  const due = all<{ id: string }>(
    "SELECT id FROM posts WHERE status = 'scheduled' AND scheduled_at <= ?",
    Date.now(),
  );
  await Promise.allSettled(due.map((p) => publishPost(p.id)));
  return due.length;
}
