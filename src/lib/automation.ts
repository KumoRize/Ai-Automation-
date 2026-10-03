import { credentialsFor, findAccountByExternal } from "./accounts";
import { randomId } from "./crypto";
import { all, get, run } from "./db";
import { pickAutomation, renderTemplate } from "./keywords";
import { adapter } from "./platforms";
import type {
  AutomationRow,
  CommentEventRow,
  IncomingComment,
  Platform,
  PostRow,
  PostTargetRow,
} from "./types";

export interface AutomationInput {
  name: string;
  postId: string | null;
  platforms: Platform[];
  keywords: string[];
  matchMode: AutomationRow["match_mode"];
  publicReply: string;
  dmMessage: string;
  includeLink: boolean;
}

export function listAutomations(): (AutomationRow & { post_caption: string | null })[] {
  return all(
    `SELECT a.*, p.caption AS post_caption FROM automations a
     LEFT JOIN posts p ON p.id = a.post_id ORDER BY a.created_at DESC`,
  );
}

export function activeAutomations(): AutomationRow[] {
  return all<AutomationRow>("SELECT * FROM automations WHERE active = 1");
}

export function validateAutomation(input: AutomationInput): string | null {
  if (!input.platforms.length) return "Pick at least one platform.";
  if (input.matchMode !== "any" && !input.keywords.length) return "Add at least one keyword.";
  if (!input.publicReply.trim() && !input.dmMessage.trim()) return "Write a public reply, a DM, or both.";
  return null;
}

export function createAutomation(input: AutomationInput): string {
  const id = randomId(12);
  run(
    `INSERT INTO automations (id, name, post_id, platforms, keywords, match_mode, public_reply, dm_message, include_link, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    id,
    input.name.trim() || input.keywords.join(", ") || "Every comment",
    input.postId,
    JSON.stringify(input.platforms),
    JSON.stringify(input.keywords),
    input.matchMode,
    input.publicReply.trim(),
    input.dmMessage.trim(),
    input.includeLink ? 1 : 0,
    Date.now(),
  );
  return id;
}

export function setAutomationActive(id: string, active: boolean): void {
  run("UPDATE automations SET active = ? WHERE id = ?", active ? 1 : 0, id);
}

export function deleteAutomation(id: string): void {
  run("DELETE FROM automations WHERE id = ?", id);
}

export function listCommentEvents(limit = 50): (CommentEventRow & { automation_name: string | null })[] {
  return all(
    `SELECT e.*, a.name AS automation_name FROM comment_events e
     LEFT JOIN automations a ON a.id = e.automation_id ORDER BY e.created_at DESC LIMIT ?`,
    limit,
  );
}

/** Finds the post (published from this app) that a platform post ID belongs to. */
function findPostByExternal(platform: Platform, externalId: string | null): PostRow | undefined {
  if (!externalId) return undefined;
  let target = get<PostTargetRow>(
    "SELECT * FROM post_targets WHERE platform = ? AND external_id = ? LIMIT 1",
    platform,
    externalId,
  );
  if (!target && platform === "facebook") {
    // Facebook IDs look like PAGEID_OBJECTID; match on the object part.
    target = get<PostTargetRow>(
      "SELECT * FROM post_targets WHERE platform = 'facebook' AND external_id LIKE ? ESCAPE '\\' LIMIT 1",
      `%\\_${externalId.split("_").pop()}`,
    );
  }
  return target ? get<PostRow>("SELECT * FROM posts WHERE id = ?", target.post_id) : undefined;
}

export interface PlannedReply {
  automation: AutomationRow | null;
  publicReply: string | null;
  dm: string | null;
}

export function planReply(
  comment: Pick<IncomingComment, "platform" | "text" | "authorName">,
  post: Pick<PostRow, "id" | "link"> | null,
  rules = activeAutomations(),
): PlannedReply {
  const automation = pickAutomation(comment.text, rules, { platform: comment.platform, postId: post?.id ?? null });
  if (!automation) return { automation: null, publicReply: null, dm: null };
  const caps = adapter(comment.platform).capabilities;
  const vars = { name: comment.authorName, link: post?.link ?? null };
  const publicReply =
    caps.publicReply && automation.public_reply ? renderTemplate(automation.public_reply, vars, false) : null;
  const dm =
    caps.privateReply && automation.dm_message
      ? renderTemplate(automation.dm_message, vars, Boolean(automation.include_link))
      : null;
  return { automation, publicReply, dm };
}

/** Runs the keyword automation for one incoming comment. Each comment is handled at most once. */
export async function handleComment(comment: IncomingComment): Promise<void> {
  const account = findAccountByExternal(comment.platform, comment.accountExternalId);
  if (!account) return;
  if (comment.authorId && comment.authorId === account.external_id) return; // our own replies

  const eventId = randomId(12);
  const inserted = run(
    `INSERT OR IGNORE INTO comment_events (id, platform, account_id, comment_id, external_post_id, author_id, author_name, text, result, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'no_match', ?)`,
    eventId,
    comment.platform,
    account.id,
    comment.commentId,
    comment.postExternalId,
    comment.authorId,
    comment.authorName,
    comment.text,
    Date.now(),
  );
  if (!inserted) return;

  const post = findPostByExternal(comment.platform, comment.postExternalId) ?? null;
  const plan = planReply(comment, post);
  if (!plan.automation) return;

  const done: string[] = [];
  const failed: string[] = [];
  if (account.demo) {
    if (plan.publicReply) done.push(`Reply (simulated): ${plan.publicReply}`);
    if (plan.dm) done.push(`DM (simulated): ${plan.dm}`);
  } else {
    const platform = adapter(comment.platform);
    let creds: Awaited<ReturnType<typeof credentialsFor>> | null = null;
    try {
      creds = await credentialsFor(account);
    } catch (err) {
      failed.push(`Could not refresh the ${comment.platform} login: ${err instanceof Error ? err.message : err}`);
    }
    if (creds && plan.publicReply && platform.replyToComment) {
      try {
        await platform.replyToComment(creds, comment, plan.publicReply);
        done.push("Public reply sent");
      } catch (err) {
        failed.push(`Public reply failed: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (creds && plan.dm && platform.sendPrivateReply) {
      try {
        await platform.sendPrivateReply(creds, comment, plan.dm);
        done.push("DM sent");
      } catch (err) {
        failed.push(`DM failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  const result = account.demo ? "simulated" : failed.length === 0 ? "replied" : done.length ? "partial" : "failed";
  run(
    "UPDATE comment_events SET automation_id = ?, result = ?, detail = ? WHERE id = ?",
    plan.automation.id,
    result,
    [...done, ...failed].join("\n"),
    eventId,
  );
  run("UPDATE automations SET trigger_count = trigger_count + 1 WHERE id = ?", plan.automation.id);
}
