import { callbackUrl, config } from "../config";
import { fileBody, mediaPublicUrl } from "../media";
import { PlatformError, requestJson, sleep } from "./http";
import type { AccountCredentials, PlatformAdapter } from "./types";

const API = "https://open.tiktokapis.com/v2";
const MB = 1024 * 1024;

interface TokenResponse {
  access_token: string;
  expires_in: number;
  open_id: string;
  refresh_token: string;
  refresh_expires_in: number;
}

function bearer(creds: AccountCredentials) {
  return { Authorization: `Bearer ${creds.accessToken}` };
}

async function privacyLevel(creds: AccountCredentials): Promise<string> {
  const info = await requestJson<{ data: { privacy_level_options: string[] } }>(
    `${API}/post/publish/creator_info/query/`,
    { method: "POST", headers: bearer(creds), json: {} },
  );
  const options = info.data.privacy_level_options ?? [];
  const wanted = config.tiktok.privacyLevel;
  if (!options.includes(wanted))
    throw new PlatformError(
      `TikTok doesn't allow privacy "${wanted}" for this account. Allowed: ${options.join(", ")}. ` +
        "Set TIKTOK_PRIVACY_LEVEL to one of these. Apps that haven't passed TikTok's audit can only use SELF_ONLY.",
    );
  return wanted;
}

/** TikTok's chunk rules: one chunk up to 64 MB; above that, 10 MB chunks with the remainder in the last one. */
export function tiktokChunks(size: number): { chunkSize: number; count: number } {
  if (size <= 64 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = 10 * MB;
  return { chunkSize, count: Math.floor(size / chunkSize) };
}

async function waitForPublish(creds: AccountCredentials, publishId: string): Promise<string | null> {
  for (let i = 0; i < 60; i++) {
    const res = await requestJson<{
      data: { status: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] };
    }>(`${API}/post/publish/status/fetch/`, {
      method: "POST",
      headers: bearer(creds),
      json: { publish_id: publishId },
    });
    const { status, fail_reason, publicaly_available_post_id } = res.data;
    if (status === "PUBLISH_COMPLETE") return publicaly_available_post_id?.[0]?.toString() ?? null;
    if (status === "FAILED") throw new PlatformError(`TikTok rejected the post: ${fail_reason ?? "unknown reason"}`);
    await sleep(5000);
  }
  // Still processing; TikTok will finish on its own.
  return null;
}

export const tiktok: PlatformAdapter = {
  id: "tiktok",
  capabilities: {
    text: false,
    image: true,
    video: true,
    publicReply: false,
    privateReply: false,
    commentSource: "none",
  },
  requiredEnv: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
  setupNotes: [
    "Until TikTok audits your app, posts are private (\"Only me\") and at most 5 accounts can post per day.",
    "Photo posts need your APP_URL domain verified in the TikTok developer portal.",
    "TikTok's public API has no comment-reply or DM endpoints, so comment automation isn't available for TikTok.",
  ],
  usesPkce: false,
  isConfigured: () => Boolean(config.tiktok.clientKey && config.tiktok.clientSecret),

  authUrl(state) {
    const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
    url.searchParams.set("client_key", config.tiktok.clientKey!);
    url.searchParams.set("scope", "user.info.basic,video.publish");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", callbackUrl("tiktok"));
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode(code) {
    const token = await requestJson<TokenResponse>(`${API}/oauth/token/`, {
      method: "POST",
      form: {
        client_key: config.tiktok.clientKey!,
        client_secret: config.tiktok.clientSecret!,
        code,
        grant_type: "authorization_code",
        redirect_uri: callbackUrl("tiktok"),
      },
    });
    const user = await requestJson<{ data: { user: { open_id: string; display_name: string } } }>(
      `${API}/user/info/?fields=open_id,display_name`,
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    return [
      {
        externalId: token.open_id,
        username: user.data.user.display_name,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + token.expires_in * 1000,
      },
    ];
  },

  async refresh(creds) {
    if (!creds.refreshToken) throw new PlatformError("TikTok session expired. Reconnect the account.");
    const token = await requestJson<TokenResponse>(`${API}/oauth/token/`, {
      method: "POST",
      form: {
        client_key: config.tiktok.clientKey!,
        client_secret: config.tiktok.clientSecret!,
        grant_type: "refresh_token",
        refresh_token: creds.refreshToken,
      },
    });
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    };
  },

  async verify(creds) {
    const user = await requestJson<{ data: { user: { display_name: string } } }>(
      `${API}/user/info/?fields=open_id,display_name`,
      { headers: bearer(creds) },
    );
    return user.data.user.display_name;
  },

  async publish(creds, { post, text }) {
    if (post.media_type === "none" || !post.media_file)
      throw new PlatformError("TikTok needs a video or an image.");
    const privacy = await privacyLevel(creds);

    if (post.media_type === "image") {
      if (post.media_mime !== "image/jpeg")
        throw new PlatformError("TikTok photo posts accept JPEG (or WebP) only. Convert the image to .jpg and try again.");
      const res = await requestJson<{ data: { publish_id: string } }>(`${API}/post/publish/content/init/`, {
        method: "POST",
        headers: bearer(creds),
        json: {
          post_info: {
            title: [...(post.title || text)].slice(0, 90).join(""),
            description: [...text].slice(0, 4000).join(""),
            privacy_level: privacy,
            auto_add_music: true,
          },
          source_info: {
            source: "PULL_FROM_URL",
            photo_cover_index: 0,
            photo_images: [mediaPublicUrl(post.media_file)],
          },
          post_mode: "DIRECT_POST",
          media_type: "PHOTO",
        },
      });
      const id = await waitForPublish(creds, res.data.publish_id);
      return { externalId: id ?? res.data.publish_id, url: null };
    }

    const size = post.media_size ?? 0;
    const { chunkSize, count } = tiktokChunks(size);
    const init = await requestJson<{ data: { publish_id: string; upload_url: string } }>(
      `${API}/post/publish/video/init/`,
      {
        method: "POST",
        headers: bearer(creds),
        json: {
          post_info: { title: text, privacy_level: privacy },
          source_info: {
            source: "FILE_UPLOAD",
            video_size: size,
            chunk_size: chunkSize,
            total_chunk_count: count,
          },
        },
      },
    );

    for (let i = 0; i < count; i++) {
      const start = i * chunkSize;
      const end = i === count - 1 ? size - 1 : start + chunkSize - 1;
      const res = await fetch(init.data.upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": post.media_mime ?? "video/mp4",
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${size}`,
        },
        body: fileBody(post.media_file, start, end),
        duplex: "half",
      } as RequestInit);
      if (!res.ok) throw new PlatformError(`TikTok upload failed (HTTP ${res.status}): ${await res.text()}`);
    }

    const id = await waitForPublish(creds, init.data.publish_id);
    // TikTok's /@handle/video/<id> link needs the handle, which requires the extra user.info.profile scope.
    return { externalId: id ?? init.data.publish_id, url: null };
  },
};
