import { callbackUrl, config } from "../config";
import { fileBody } from "../media";
import { PlatformError, requestJson, sleep } from "./http";
import type { AccountCredentials, PlatformAdapter } from "./types";

const API = "https://api.x.com/2";
const SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "dm.write", "dm.read", "offline.access"];
const CHUNK = 4 * 1024 * 1024;

function bearer(creds: AccountCredentials) {
  return { Authorization: `Bearer ${creds.accessToken}` };
}

/** Confidential clients authenticate with Basic auth; public clients send client_id in the body. */
function tokenRequest(form: Record<string, string>) {
  const headers: Record<string, string> = {};
  if (config.x.clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${config.x.clientId}:${config.x.clientSecret}`).toString("base64")}`;
  } else {
    form.client_id = config.x.clientId!;
  }
  return requestJson<{ access_token: string; refresh_token?: string; expires_in: number }>(
    `${API}/oauth2/token`,
    { method: "POST", headers, form },
  );
}

async function uploadMedia(creds: AccountCredentials, file: string, mime: string, size: number, video: boolean) {
  const init = await requestJson<{ data: { id: string } }>(`${API}/media/upload/initialize`, {
    method: "POST",
    headers: bearer(creds),
    json: { media_type: mime, total_bytes: size, media_category: video ? "tweet_video" : "tweet_image" },
  });
  const mediaId = init.data.id;

  for (let index = 0, start = 0; start < size; index++, start += CHUNK) {
    const end = Math.min(start + CHUNK, size) - 1;
    const chunk = await new Response(fileBody(file, start, end)).blob();
    const form = new FormData();
    form.append("segment_index", String(index));
    form.append("media", chunk, "chunk");
    await requestJson(`${API}/media/upload/${mediaId}/append`, { method: "POST", headers: bearer(creds), body: form });
  }

  const fin = await requestJson<{ data: { processing_info?: { state: string; check_after_secs?: number } } }>(
    `${API}/media/upload/${mediaId}/finalize`,
    { method: "POST", headers: bearer(creds) },
  );
  let info = fin.data.processing_info;
  for (let i = 0; info && info.state !== "succeeded" && i < 60; i++) {
    if (info.state === "failed") throw new PlatformError("X could not process the media.");
    await sleep((info.check_after_secs ?? 5) * 1000);
    const status = await requestJson<{ data: { processing_info?: { state: string; check_after_secs?: number } } }>(
      `${API}/media/upload?command=STATUS&media_id=${mediaId}`,
      { headers: bearer(creds) },
    );
    info = status.data.processing_info;
  }
  return mediaId;
}

interface SearchResponse {
  data?: { id: string; text: string; author_id: string }[];
  includes?: { users?: { id: string; username: string }[] };
  meta?: { newest_id?: string };
}

export const x: PlatformAdapter = {
  id: "x",
  capabilities: {
    text: true,
    image: true,
    video: true,
    publicReply: true,
    privateReply: true,
    commentSource: "poll",
  },
  requiredEnv: ["X_CLIENT_ID"],
  setupNotes: [
    "X charges per API call (about $0.015 per post, more with a link). Buy credits in the X developer console.",
    "Reply automation reads replies with paid search calls, so it is off until you set X_POLL_REPLIES=1.",
    "DMs only reach people whose settings accept messages from you.",
  ],
  usesPkce: true,
  isConfigured: () => Boolean(config.x.clientId),

  authUrl(state, codeChallenge) {
    const url = new URL("https://x.com/i/oauth2/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", config.x.clientId!);
    url.searchParams.set("redirect_uri", callbackUrl("x"));
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge!);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  },

  async exchangeCode(code, codeVerifier) {
    const token = await tokenRequest({
      code,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl("x"),
      code_verifier: codeVerifier!,
    });
    const me = await requestJson<{ data: { id: string; username: string } }>(`${API}/users/me`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    return [
      {
        externalId: me.data.id,
        username: `@${me.data.username}`,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        expiresAt: Date.now() + token.expires_in * 1000,
      },
    ];
  },

  async refresh(creds) {
    if (!creds.refreshToken) throw new PlatformError("X session expired. Reconnect the account.");
    const token = await tokenRequest({ grant_type: "refresh_token", refresh_token: creds.refreshToken });
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? creds.refreshToken,
      expiresAt: Date.now() + token.expires_in * 1000,
    };
  },

  async publish(creds, { post, text }) {
    const body: { text: string; media?: { media_ids: string[] } } = { text };
    if (post.media_type !== "none" && post.media_file) {
      const id = await uploadMedia(
        creds,
        post.media_file,
        post.media_mime ?? "application/octet-stream",
        post.media_size ?? 0,
        post.media_type === "video",
      );
      body.media = { media_ids: [id] };
    }
    const res = await requestJson<{ data: { id: string } }>(`${API}/tweets`, {
      method: "POST",
      headers: bearer(creds),
      json: body,
    });
    const handle = creds.username.replace(/^@/, "");
    return { externalId: res.data.id, url: `https://x.com/${handle}/status/${res.data.id}` };
  },

  async verify(creds) {
    const me = await requestJson<{ data: { username: string } }>(`${API}/users/me`, { headers: bearer(creds) });
    return `@${me.data.username}`;
  },

  async replyToComment(creds, comment, text) {
    await requestJson(`${API}/tweets`, {
      method: "POST",
      headers: bearer(creds),
      json: { text, reply: { in_reply_to_tweet_id: comment.commentId } },
    });
  },

  async sendPrivateReply(creds, comment, text) {
    if (!comment.authorId) throw new PlatformError("Missing reply author.");
    await requestJson(`${API}/dm_conversations/with/${comment.authorId}/messages`, {
      method: "POST",
      headers: bearer(creds),
      json: { text },
    });
  },

  async pollComments(creds, tweetId, cursor) {
    const url = new URL(`${API}/tweets/search/recent`);
    url.searchParams.set("query", `conversation_id:${tweetId} is:reply -from:${creds.username.replace(/^@/, "")}`);
    url.searchParams.set("tweet.fields", "author_id,conversation_id");
    url.searchParams.set("expansions", "author_id");
    url.searchParams.set("user.fields", "username");
    url.searchParams.set("max_results", "100");
    if (cursor) url.searchParams.set("since_id", cursor);
    const res = await requestJson<SearchResponse>(url.toString(), { headers: bearer(creds) });
    const users = new Map((res.includes?.users ?? []).map((u) => [u.id, u.username]));
    const comments = (res.data ?? []).map((t) => ({
      platform: "x" as const,
      accountExternalId: creds.externalId,
      commentId: t.id,
      postExternalId: tweetId,
      authorId: t.author_id,
      authorName: users.get(t.author_id) ?? null,
      text: t.text.replace(/^(@\w+\s+)+/, ""),
    }));
    return { comments, cursor: res.meta?.newest_id ?? cursor };
  },
};
