import path from "node:path";

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export const config = {
  /** Public base URL of this app, e.g. https://social.example.com. Platforms call back and fetch media here. */
  appUrl: (env("APP_URL") ?? "http://localhost:3000").replace(/\/+$/, ""),
  appPassword: env("APP_PASSWORD"),
  appSecret: env("APP_SECRET"),
  dataDir: path.resolve(/*turbopackIgnore: true*/ env("DATA_DIR") ?? "./data"),
  cronSecret: env("CRON_SECRET"),
  disableInternalScheduler: env("DISABLE_INTERNAL_SCHEDULER") === "1",
  pollIntervalMinutes: Number(env("POLL_INTERVAL_MINUTES") ?? "5"),

  graphVersion: env("META_GRAPH_VERSION") ?? "v23.0",
  metaWebhookVerifyToken: env("META_WEBHOOK_VERIFY_TOKEN"),

  instagram: {
    appId: env("INSTAGRAM_APP_ID"),
    appSecret: env("INSTAGRAM_APP_SECRET"),
  },
  facebook: {
    appId: env("META_APP_ID"),
    appSecret: env("META_APP_SECRET"),
  },
  tiktok: {
    clientKey: env("TIKTOK_CLIENT_KEY"),
    clientSecret: env("TIKTOK_CLIENT_SECRET"),
    // Unaudited TikTok apps may only post with SELF_ONLY visibility.
    privacyLevel: env("TIKTOK_PRIVACY_LEVEL") ?? "SELF_ONLY",
  },
  youtube: {
    clientId: env("GOOGLE_CLIENT_ID"),
    clientSecret: env("GOOGLE_CLIENT_SECRET"),
    privacyStatus: (env("YOUTUBE_PRIVACY_STATUS") ?? "public") as "public" | "unlisted" | "private",
  },
  x: {
    clientId: env("X_CLIENT_ID"),
    clientSecret: env("X_CLIENT_SECRET"),
    // Reading replies costs money on X's pay-per-use API, so polling is opt-in.
    pollReplies: env("X_POLL_REPLIES") === "1",
  },

  anthropicModel: env("ANTHROPIC_MODEL") ?? "claude-opus-5-5",
};

export function callbackUrl(platform: string): string {
  return `${config.appUrl}/api/oauth/${platform}/callback`;
}

/** Problems that stop the app from running safely. Shown on the login page. */
export function configProblems(): string[] {
  const problems: string[] = [];
  if (!config.appPassword) problems.push("APP_PASSWORD is not set.");
  if (!config.appSecret || config.appSecret.length < 32)
    problems.push("APP_SECRET must be set to a random string of at least 32 characters.");
  return problems;
}
