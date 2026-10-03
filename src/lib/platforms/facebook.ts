import { callbackUrl, config } from "../config";
import { mediaPublicUrl } from "../media";
import { PlatformError, requestJson } from "./http";
import type { PlatformAdapter } from "./types";

const GRAPH = () => `https://graph.facebook.com/${config.graphVersion}`;
const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_manage_engagement",
  "pages_manage_metadata",
  "pages_messaging",
];

export const facebook: PlatformAdapter = {
  id: "facebook",
  capabilities: {
    text: true,
    image: true,
    video: true,
    publicReply: true,
    privateReply: true,
    commentSource: "webhook",
  },
  requiredEnv: ["META_APP_ID", "META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN"],
  setupNotes: [
    "Posts to Facebook Pages you manage (not personal profiles, which Meta doesn't allow).",
    "Every Page you pick during login is connected as its own account.",
    "Other people can only connect after Meta App Review approves the permissions.",
  ],
  usesPkce: false,
  isConfigured: () => Boolean(config.facebook.appId && config.facebook.appSecret),

  authUrl(state) {
    const url = new URL(`https://www.facebook.com/${config.graphVersion}/dialog/oauth`);
    url.searchParams.set("client_id", config.facebook.appId!);
    url.searchParams.set("redirect_uri", callbackUrl("facebook"));
    url.searchParams.set("state", state);
    url.searchParams.set("scope", SCOPES.join(","));
    url.searchParams.set("response_type", "code");
    return url.toString();
  },

  async exchangeCode(code) {
    const tokenUrl = new URL(`${GRAPH()}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", config.facebook.appId!);
    tokenUrl.searchParams.set("client_secret", config.facebook.appSecret!);
    tokenUrl.searchParams.set("redirect_uri", callbackUrl("facebook"));
    tokenUrl.searchParams.set("code", code);
    const short = await requestJson<{ access_token: string }>(tokenUrl.toString());

    // Page tokens derived from a long-lived user token don't expire.
    const longUrl = new URL(`${GRAPH()}/oauth/access_token`);
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", config.facebook.appId!);
    longUrl.searchParams.set("client_secret", config.facebook.appSecret!);
    longUrl.searchParams.set("fb_exchange_token", short.access_token);
    const long = await requestJson<{ access_token: string }>(longUrl.toString());

    const pages = await requestJson<{ data: { id: string; name: string; access_token: string }[] }>(
      `${GRAPH()}/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(long.access_token)}`,
    );
    if (!pages.data?.length)
      throw new PlatformError("No Facebook Pages found. Create a Page or grant access to one during login.");
    return pages.data.map((p) => ({
      externalId: p.id,
      username: p.name,
      accessToken: p.access_token,
      expiresAt: null,
    }));
  },

  async afterConnect(creds) {
    await requestJson(`${GRAPH()}/${creds.externalId}/subscribed_apps`, {
      method: "POST",
      form: { subscribed_fields: "feed,messages", access_token: creds.accessToken },
    });
  },

  async publish(creds, { post, text }) {
    const page = creds.externalId;
    const token = creds.accessToken;
    if (post.media_type === "image" && post.media_file) {
      const res = await requestJson<{ id: string; post_id?: string }>(`${GRAPH()}/${page}/photos`, {
        method: "POST",
        form: { url: mediaPublicUrl(post.media_file), caption: text, access_token: token },
      });
      const id = res.post_id ?? `${page}_${res.id}`;
      return { externalId: id, url: `https://www.facebook.com/${id}` };
    }
    if (post.media_type === "video" && post.media_file) {
      const res = await requestJson<{ id: string }>(`${GRAPH()}/${page}/videos`, {
        method: "POST",
        form: {
          file_url: mediaPublicUrl(post.media_file),
          description: text,
          ...(post.title ? { title: post.title } : {}),
          access_token: token,
        },
      });
      return { externalId: `${page}_${res.id}`, url: `https://www.facebook.com/${page}/videos/${res.id}` };
    }
    const form: Record<string, string> = { message: text, access_token: token };
    if (post.link && !post.link_in_caption) form.link = post.link;
    const res = await requestJson<{ id: string }>(`${GRAPH()}/${page}/feed`, { method: "POST", form });
    return { externalId: res.id, url: `https://www.facebook.com/${res.id}` };
  },

  async replyToComment(creds, comment, text) {
    await requestJson(`${GRAPH()}/${comment.commentId}/comments`, {
      method: "POST",
      form: { message: text, access_token: creds.accessToken },
    });
  },

  async sendPrivateReply(creds, comment, text) {
    await requestJson(
      `${GRAPH()}/${creds.externalId}/messages?access_token=${encodeURIComponent(creds.accessToken)}`,
      {
        method: "POST",
        json: { recipient: { comment_id: comment.commentId }, message: { text } },
      },
    );
  },
};
