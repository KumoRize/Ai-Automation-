export const PLATFORMS = ["instagram", "facebook", "tiktok", "youtube", "x"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
};

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

export type MediaType = "none" | "image" | "video";

export interface AccountRow {
  id: string;
  platform: Platform;
  external_id: string;
  username: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  meta: string;
  demo: number;
  created_at: number;
}

export interface PostRow {
  id: string;
  title: string;
  caption: string;
  link: string | null;
  link_in_caption: number;
  media_file: string | null;
  media_type: MediaType;
  media_mime: string | null;
  media_size: number | null;
  status: "scheduled" | "publishing" | "published" | "partial" | "failed";
  scheduled_at: number | null;
  created_at: number;
}

export interface PostTargetRow {
  id: string;
  post_id: string;
  /** Null once the account is disconnected; account_name keeps the history readable. */
  account_id: string | null;
  account_name: string;
  platform: Platform;
  status: "pending" | "publishing" | "published" | "failed";
  external_id: string | null;
  external_url: string | null;
  error: string | null;
  poll_cursor: string | null;
  published_at: number | null;
}

export interface AutomationRow {
  id: string;
  name: string;
  post_id: string | null;
  platforms: string;
  keywords: string;
  match_mode: "contains" | "exact" | "any";
  public_reply: string;
  dm_message: string;
  include_link: number;
  active: number;
  trigger_count: number;
  created_at: number;
}

export interface CommentEventRow {
  id: string;
  platform: Platform;
  account_id: string | null;
  comment_id: string;
  external_post_id: string | null;
  author_id: string | null;
  author_name: string | null;
  text: string;
  automation_id: string | null;
  result: "no_match" | "replied" | "partial" | "failed" | "simulated";
  detail: string;
  created_at: number;
}

/** A comment that arrived from a webhook or a poll, normalized across platforms. */
export interface IncomingComment {
  platform: Platform;
  accountExternalId: string;
  commentId: string;
  /** The platform's ID for the post/video/tweet the comment is on. */
  postExternalId: string | null;
  authorId: string | null;
  authorName: string | null;
  text: string;
}
