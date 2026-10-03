import { youtubeTags, youtubeTitle } from "../captions";
import { callbackUrl, config } from "../config";
import { fileBody } from "../media";
import { PlatformError, requestJson } from "./http";
import type { AccountCredentials, PlatformAdapter } from "./types";

const API = "https://www.googleapis.com/youtube/v3";
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

function bearer(creds: AccountCredentials) {
  return { Authorization: `Bearer ${creds.accessToken}` };
}

interface CommentThreads {
  items?: {
    id: string;
    snippet: {
      topLevelComment: {
        id: string;
        snippet: {
          textOriginal: string;
          authorDisplayName: string;
          authorChannelId?: { value: string };
          publishedAt: string;
        };
      };
    };
  }[];
}

export const youtube: PlatformAdapter = {
  id: "youtube",
  capabilities: {
    text: false,
    image: false,
    video: true,
    publicReply: true,
    privateReply: false,
    commentSource: "poll",
  },
  requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  setupNotes: [
    "Video only. Videos under 3 minutes in vertical format show up as Shorts.",
    "Uploads from API projects that haven't passed Google's audit are locked to private.",
    "Each upload uses 1,600 of the default 10,000 daily API quota units, so about 6 uploads a day.",
    "YouTube has no DMs; keyword automation can only reply publicly.",
  ],
  usesPkce: false,
  isConfigured: () => Boolean(config.youtube.clientId && config.youtube.clientSecret),

  authUrl(state) {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", config.youtube.clientId!);
    url.searchParams.set("redirect_uri", callbackUrl("youtube"));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode(code) {
    const token = await requestJson<{ access_token: string; refresh_token?: string; expires_in: number }>(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        form: {
          code,
          client_id: config.youtube.clientId!,
          client_secret: config.youtube.clientSecret!,
          redirect_uri: callbackUrl("youtube"),
          grant_type: "authorization_code",
        },
      },
    );
    const channels = await requestJson<{ items?: { id: string; snippet: { title: string } }[] }>(
      `${API}/channels?part=snippet&mine=true`,
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    const channel = channels.items?.[0];
    if (!channel) throw new PlatformError("This Google account has no YouTube channel.");
    return [
      {
        externalId: channel.id,
        username: channel.snippet.title,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        expiresAt: Date.now() + token.expires_in * 1000,
      },
    ];
  },

  async refresh(creds) {
    if (!creds.refreshToken) throw new PlatformError("YouTube session expired. Reconnect the account.");
    const token = await requestJson<{ access_token: string; expires_in: number }>(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        form: {
          client_id: config.youtube.clientId!,
          client_secret: config.youtube.clientSecret!,
          refresh_token: creds.refreshToken,
          grant_type: "refresh_token",
        },
      },
    );
    return { accessToken: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
  },

  async publish(creds, { post, text }) {
    if (post.media_type !== "video" || !post.media_file) throw new PlatformError("YouTube needs a video.");
    const input = { title: post.title, caption: post.caption, link: post.link, linkInCaption: true };
    const metadata = {
      snippet: {
        title: youtubeTitle(input),
        description: text,
        tags: youtubeTags(post.caption),
        categoryId: "22",
      },
      status: { privacyStatus: config.youtube.privacyStatus, selfDeclaredMadeForKids: false },
    };

    // Resumable upload: create a session, then stream the file to it.
    const start = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          ...bearer(creds),
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": String(post.media_size ?? 0),
          "X-Upload-Content-Type": post.media_mime ?? "video/mp4",
        },
        body: JSON.stringify(metadata),
      },
    );
    const session = start.headers.get("location");
    if (!start.ok || !session)
      throw new PlatformError(`YouTube refused the upload: ${await start.text()}`, start.status);

    const upload = await fetch(session, {
      method: "PUT",
      headers: {
        "Content-Type": post.media_mime ?? "video/mp4",
        "Content-Length": String(post.media_size ?? 0),
      },
      body: fileBody(post.media_file),
      duplex: "half",
    } as RequestInit);
    const body = (await upload.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!upload.ok || !body.id)
      throw new PlatformError(`YouTube upload failed: ${body.error?.message ?? upload.status}`, upload.status);
    return { externalId: body.id, url: `https://www.youtube.com/watch?v=${body.id}` };
  },

  async replyToComment(creds, comment, text) {
    await requestJson(`${API}/comments?part=snippet`, {
      method: "POST",
      headers: bearer(creds),
      json: { snippet: { parentId: comment.commentId, textOriginal: text } },
    });
  },

  async pollComments(creds, videoId, cursor) {
    const url = `${API}/commentThreads?part=snippet&videoId=${encodeURIComponent(videoId)}&order=time&maxResults=50&textFormat=plainText`;
    const res = await requestJson<CommentThreads>(url, { headers: bearer(creds) });
    const since = cursor ? Date.parse(cursor) : 0;
    let newest = cursor;
    const comments = (res.items ?? [])
      .map((t) => t.snippet.topLevelComment)
      .filter((c) => Date.parse(c.snippet.publishedAt) > since)
      .filter((c) => c.snippet.authorChannelId?.value !== creds.externalId)
      .map((c) => {
        if (!newest || Date.parse(c.snippet.publishedAt) > Date.parse(newest)) newest = c.snippet.publishedAt;
        return {
          platform: "youtube" as const,
          accountExternalId: creds.externalId,
          commentId: c.id,
          postExternalId: videoId,
          authorId: c.snippet.authorChannelId?.value ?? null,
          authorName: c.snippet.authorDisplayName,
          text: c.snippet.textOriginal,
        };
      });
    return { comments, cursor: newest ?? new Date().toISOString() };
  },
};
