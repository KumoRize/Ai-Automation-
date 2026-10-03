import { credentialsFor, getAccount } from "./accounts";
import { activeAutomations, handleComment } from "./automation";
import { config } from "./config";
import { all, run } from "./db";
import { adapter } from "./platforms";
import { publishDuePosts } from "./publisher";
import type { Platform, PostTargetRow } from "./types";

const POLL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

interface PollState {
  cursor: string | null;
  lastPolledAt: number;
}

function pollablePlatforms(): Platform[] {
  const withRules = new Set(activeAutomations().flatMap((a) => JSON.parse(a.platforms) as Platform[]));
  return (["youtube", "x"] as const).filter(
    (p) => withRules.has(p) && (p !== "x" || config.x.pollReplies),
  );
}

/** Checks recent YouTube videos and X posts for new comments (these platforms have no comment webhooks). */
export async function pollComments(): Promise<number> {
  const platforms = pollablePlatforms();
  if (!platforms.length) return 0;
  const targets = all<PostTargetRow>(
    `SELECT t.* FROM post_targets t JOIN accounts a ON a.id = t.account_id
     WHERE t.status = 'published' AND a.demo = 0 AND t.published_at > ?
       AND t.platform IN (${platforms.map(() => "?").join(",")})`,
    Date.now() - POLL_WINDOW_MS,
    ...platforms,
  );
  let handled = 0;
  for (const target of targets) {
    const state: PollState = target.poll_cursor
      ? JSON.parse(target.poll_cursor)
      : { cursor: null, lastPolledAt: 0 };
    if (Date.now() - state.lastPolledAt < config.pollIntervalMinutes * 60 * 1000) continue;
    const account = getAccount(target.account_id);
    const poll = adapter(target.platform).pollComments;
    if (!account || !poll || !target.external_id) continue;
    try {
      const creds = await credentialsFor(account);
      const res = await poll(creds, target.external_id, state.cursor);
      for (const comment of res.comments) {
        await handleComment(comment);
        handled++;
      }
      state.cursor = res.cursor;
    } catch (err) {
      console.error(`[poll] ${target.platform} ${target.external_id}:`, err);
    }
    state.lastPolledAt = Date.now();
    run("UPDATE post_targets SET poll_cursor = ? WHERE id = ?", JSON.stringify(state), target.id);
  }
  return handled;
}

let running = false;

export async function tick(): Promise<{ published: number; comments: number }> {
  if (running) return { published: 0, comments: 0 };
  running = true;
  try {
    const published = await publishDuePosts();
    const comments = await pollComments();
    return { published, comments };
  } finally {
    running = false;
  }
}

/** Marks uploads that were cut off by a restart as failed, so they can be retried. */
export function recoverInterrupted(): void {
  run(
    "UPDATE post_targets SET status = 'failed', error = 'Interrupted by a server restart. Click Retry.' WHERE status = 'publishing'",
  );
  run(
    `UPDATE posts SET status = CASE
       WHEN NOT EXISTS (SELECT 1 FROM post_targets t WHERE t.post_id = posts.id AND t.status = 'published') THEN 'failed'
       ELSE 'partial' END
     WHERE status = 'publishing'`,
  );
}

const globalForScheduler = globalThis as unknown as { __socialScheduler?: NodeJS.Timeout };

export function startScheduler(): void {
  if (globalForScheduler.__socialScheduler || config.disableInternalScheduler) return;
  recoverInterrupted();
  globalForScheduler.__socialScheduler = setInterval(() => {
    tick().catch((err) => console.error("[scheduler]", err));
  }, 60 * 1000);
}
