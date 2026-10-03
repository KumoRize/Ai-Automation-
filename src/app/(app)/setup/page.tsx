import { connection } from "next/server";
import { aiStatus } from "@/lib/ai";
import { callbackUrl, config } from "@/lib/config";
import { adapters } from "@/lib/platforms";
import { PLATFORMS, type Platform } from "@/lib/types";
import { Notice, PlatformBadge } from "@/components/ui";

const PORTALS: Record<Platform, { name: string; url: string }> = {
  instagram: { name: "Meta for Developers (Instagram API with Instagram Login)", url: "https://developers.facebook.com/apps" },
  facebook: { name: "Meta for Developers (Facebook Login for Business)", url: "https://developers.facebook.com/apps" },
  tiktok: { name: "TikTok for Developers (Login Kit + Content Posting API)", url: "https://developers.tiktok.com/apps" },
  youtube: { name: "Google Cloud Console (YouTube Data API v3 + OAuth client)", url: "https://console.cloud.google.com/apis/credentials" },
  x: { name: "X Developer Console (OAuth 2.0, Web App)", url: "https://developer.x.com/en/portal/dashboard" },
};

function Check({ ok }: { ok: boolean }) {
  return <span className={ok ? "text-emerald-600" : "text-slate-400"}>{ok ? "✓" : "○"}</span>;
}

function Code({ children }: { children: string }) {
  return <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 text-xs">{children}</code>;
}

export default async function SetupPage() {
  await connection();
  const isLocal = config.appUrl.includes("localhost") || config.appUrl.includes("127.0.0.1");
  const ai = aiStatus();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Setup</h1>
        <p className="text-sm text-slate-500">
          Each platform needs a free developer app. Create one, paste its keys into your environment, and restart.
        </p>
      </div>

      {isLocal && (
        <Notice tone="warning">
          APP_URL is <Code>{config.appUrl}</Code>. Platforms can&apos;t reach localhost, so Instagram, Facebook and
          TikTok media uploads and comment webhooks won&apos;t work until the app runs on a public HTTPS address
          (or a tunnel like ngrok or Cloudflare Tunnel) and APP_URL points to it.
        </Notice>
      )}

      <div className="card space-y-2 text-sm">
        <p className="font-medium">General</p>
        <p>
          <Check ok={ai.provider !== "basic"} /> AI generator: <strong>{ai.label}</strong>
          {ai.problem && <span className="text-red-600"> ({ai.problem})</span>}
        </p>
        {ai.provider === "basic" && (
          <p className="pl-5 text-slate-600">
            Free upgrade: get a Google Gemini key at{" "}
            <a className="text-brand-600 underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>{" "}
            (no card needed) and set <Code>GEMINI_API_KEY</Code>. Other free options: <Code>GROQ_API_KEY</Code> from
            console.groq.com, or <Code>OLLAMA_MODEL</Code> to run a model on your own computer.
          </p>
        )}
        <p><Check ok={Boolean(config.metaWebhookVerifyToken)} /> Meta comment webhooks: <Code>META_WEBHOOK_VERIFY_TOKEN</Code></p>
        <p className="pl-5 text-slate-600">
          Webhook callback URL for both the Instagram and the Facebook (Page) products: <Code>{`${config.appUrl}/api/webhooks/meta`}</Code>.
          Subscribe to <strong>comments</strong> (Instagram) and <strong>feed</strong> (Page).
        </p>
        <p className="text-slate-600">
          Scheduled posts and YouTube/X comment checks run every minute inside the server.
          {config.cronSecret ? " The /api/cron endpoint is also enabled for external schedulers." : ""}
        </p>
      </div>

      {PLATFORMS.map((p) => {
        const a = adapters[p];
        return (
          <div key={p} className="card space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <PlatformBadge platform={p} />
              <span className={a.isConfigured() ? "text-emerald-600" : "text-slate-400"}>
                {a.isConfigured() ? "Ready to connect" : "Keys missing"}
              </span>
            </div>
            <p>
              1. Create an app at{" "}
              <a className="text-brand-600 underline" href={PORTALS[p].url} target="_blank" rel="noreferrer">{PORTALS[p].name}</a>.
            </p>
            <p>2. Add this redirect / callback URL: <Code>{callbackUrl(p)}</Code></p>
            <p>
              3. Set{" "}
              {a.requiredEnv.map((v, i) => (
                <span key={v}>{i > 0 && ", "}<Code>{v}</Code></span>
              ))}
              {p === "x" && <> (and <Code>X_CLIENT_SECRET</Code> for a confidential client)</>}.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-slate-600">
              {a.setupNotes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
