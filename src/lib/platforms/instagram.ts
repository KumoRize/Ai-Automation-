import { callbackUrl, config } from "../config";
import { mediaPublicUrl } from "../media";
import { PlatformError, requestJson, sleep } from "./http";
import type { PlatformAdapter } from "./types";

// Instagram API with Instagram Login: works with Business and Creator accounts, no Facebook Page needed.
const GRAPH = () => `https://graph.instagram.com/${config.graphVersion}`;
const SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
];

async function longLivedToken(shortToken: string) {
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", config.instagram.appSecret!);
  url.searchParams.set("access_token", shortToken);
  return requestJson<{ access_token: string; expires_in: number }>(url.toString());
}

async function waitForContainer(containerId: string, token: string): Promise<void> {
  // Videos can take a few minutes to process before they can be published.
  for (let i = 0; i < 60; i++) {
    const url = `${GRAPH()}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`;
    const res = await requestJson<{ status_code?: string; status?: string }>(url);
    if (res.status_code === "FINISHED") return;
    if (res.status_code === "ERROR" || res.status_code === "EXPIRED")
      throw new PlatformError(`Instagram could not process the media: ${res.status ?? res.status_code}`);
    await sleep(5000);
  }
  throw new PlatformError("Instagram took too long to process the media.");
}

export const instagram: PlatformAdapter = {
  id: "instagram",
  capabilities: {
    text: false,
    image: true,
    video: true,
    publicReply: true,
    privateReply: true,
    commentSource: "webhook",
  },
  requiredEnv: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN"],
  setupNotes: [
    "Needs an Instagram Professional (Business or Creator) account.",
    "Other people can only connect after Meta App Review approves the permissions.",
    "Images must be JPEG. Videos are posted as Reels.",
  ],
  usesPkce: false,
  isConfigured: () => Boolean(config.instagram.appId && config.instagram.appSecret),

  authUrl(state) {
    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.searchParams.set("client_id", config.instagram.appId!);
    url.searchParams.set("redirect_uri", callbackUrl("instagram"));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES.join(","));
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode(code) {
    const res = await requestJson<{
      access_token?: string;
      data?: { access_token: string }[];
    }>("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      form: {
        client_id: config.instagram.appId!,
        client_secret: config.instagram.appSecret!,
        grant_type: "authorization_code",
        redirect_uri: callbackUrl("instagram"),
        code,
      },
    });
    const shortToken = res.access_token ?? res.data?.[0]?.access_token;
    if (!shortToken) throw new PlatformError("Instagram did not return an access token.");
    const long = await longLivedToken(shortToken);
    const me = await requestJson<{ id: string; user_id?: string; username: string }>(
      `${GRAPH()}/me?fields=id,user_id,username&access_token=${encodeURIComponent(long.access_token)}`,
    );
    return [
      {
        // user_id is the professional account ID that webhooks use.
        externalId: me.user_id ?? me.id,
        username: `@${me.username}`,
        accessToken: long.access_token,
        expiresAt: Date.now() + long.expires_in * 1000,
      },
    ];
  },

  async refresh(creds) {
    const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(creds.accessToken)}`;
    const res = await requestJson<{ access_token: string; expires_in: number }>(url);
    return { accessToken: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 };
  },

  async afterConnect(creds) {
    await requestJson(`${GRAPH()}/me/subscribed_apps`, {
      method: "POST",
      form: { subscribed_fields: "comments,messages", access_token: creds.accessToken },
    });
  },

  async publish(creds, { post, text }) {
    if (post.media_type === "none" || !post.media_file)
      throw new PlatformError("Instagram needs an image or a video.");
    if (post.media_type === "image" && post.media_mime !== "image/jpeg")
      throw new PlatformError("Instagram only accepts JPEG images. Convert the image to .jpg and try again.");

    const form: Record<string, string> = { caption: text, access_token: creds.accessToken };
    if (post.media_type === "image") {
      form.image_url = mediaPublicUrl(post.media_file);
    } else {
      form.media_type = "REELS";
      form.video_url = mediaPublicUrl(post.media_file);
      form.share_to_feed = "true";
    }
    const container = await requestJson<{ id: string }>(`${GRAPH()}/${creds.externalId}/media`, { method: "POST", form });
    await waitForContainer(container.id, creds.accessToken);
    const published = await requestJson<{ id: string }>(`${GRAPH()}/${creds.externalId}/media_publish`, {
      method: "POST",
      form: { creation_id: container.id, access_token: creds.accessToken },
    });
    let url: string | null = null;
    try {
      const info = await requestJson<{ permalink?: string }>(
        `${GRAPH()}/${published.id}?fields=permalink&access_token=${encodeURIComponent(creds.accessToken)}`,
      );
      url = info.permalink ?? null;
    } catch {
      // The post is live; a missing permalink isn't worth failing over.
    }
    return { externalId: published.id, url };
  },

  async verify(creds) {
    const me = await requestJson<{ username: string }>(
      `${GRAPH()}/me?fields=user_id,username&access_token=${encodeURIComponent(creds.accessToken)}`,
    );
    return `@${me.username}`;
  },

  async replyToComment(creds, comment, text) {
    await requestJson(`${GRAPH()}/${comment.commentId}/replies`, {
      method: "POST",
      form: { message: text, access_token: creds.accessToken },
    });
  },

  async sendPrivateReply(creds, comment, text) {
    // A "private reply" is a DM tied to the comment. Instagram allows one per comment, within 7 days.
    await requestJson(`${GRAPH()}/${creds.externalId}/messages?access_token=${encodeURIComponent(creds.accessToken)}`, {
      method: "POST",
      json: { recipient: { comment_id: comment.commentId }, message: { text } },
    });
  },
};
