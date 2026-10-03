# Social Autopilot

Upload a post once and publish it to Instagram, Facebook, TikTok, YouTube and X at the same time. Keyword comment automation (like ManyChat) sends people your link by DM, and an AI generator writes trending hashtags, keywords and captions in your style.

It's free and open source. You run it yourself, and the AI generator runs on free services (or with no key at all). Each platform's API is free to use, except X, which charges per post (see [Costs](#costs)).

## Features

| Feature | What it does |
|---|---|
| **One upload, five channels** | Add a photo, video or text post, tick the accounts, and publish now or schedule it. Each platform gets a caption trimmed to its own limits. |
| **Keyword DM automation** | Set trigger words per post or for all posts. When someone comments "LINK", they get a DM with your link and an optional public reply. |
| **Comment auto-replies** | Reply publicly to every comment, or only to comments with certain words. |
| **Direct links** | Save a link on each post. It can go in the caption, in the DM, or both. |
| **AI generator (free)** | Describe your post and get hashtags, search keywords, a hook, a title and a caption in your chosen style. It runs on Google Gemini's free tier, which can also check live trends with Google Search, or on Groq or Ollama, also free. With no key it falls back to a built-in Basic mode, so it always works. |
| **Demo accounts** | Try every feature without connecting real accounts. Nothing gets posted. |
| **Activity log** | Shows each comment received, which rule it matched, and what was sent. |

## What each platform supports

| | Instagram | Facebook Page | TikTok | YouTube | X |
|---|---|---|---|---|---|
| Text post | – | ✓ | – | – | ✓ |
| Image | ✓ (JPEG) | ✓ | ✓ (JPEG) | – | ✓ |
| Video | ✓ (Reels) | ✓ | ✓ | ✓ | ✓ |
| Public comment reply | ✓ | ✓ | – | ✓ | ✓ |
| DM to commenter | ✓ | ✓ | – | – | ✓ |
| How comments arrive | webhook | webhook | not available | checked every 5 min | checked every 5 min (opt-in) |

TikTok's public API has no endpoints for comment replies or DMs, so comment automation can't work there. YouTube has no DMs.

## Quick start (about 5 minutes)

You need Node.js 22.5 or newer.

```bash
npm install
cp .env.example .env.local     # then set APP_PASSWORD and APP_SECRET
npm run build && npm start     # or: npm run dev
```

Open http://localhost:3000 and log in with your password. Then:

1. Go to **Accounts** and click **Add demo account** for each platform.
2. Go to **Create post**, add a photo, turn on **Keyword DM automation**, and publish.
3. Go to **Automations** and use **Test a comment** to see the DM the rule would send.

The AI generator works right away in **Basic mode** (templates, no key). For real AI captions and live trending hashtags, add a free key (see the next section).

## Free AI setup

Add one or more keys to `.env.local`, then restart. The first three cost nothing. If you set several, the app tries the free ones first and moves to the next automatically when one fails or hits its limit. You can also pick one with `AI_PROVIDER`.

| Option | How to get it | What you get |
|---|---|---|
| **Google Gemini** (recommended) | Create a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). No card needed. Set `GEMINI_API_KEY`. | Good captions, plus **live trend checks with Google Search** where your free allowance includes it. The app picks the newest Gemini model your key can use, so it keeps working when Google retires old models |
| **Groq** | Create a key at [console.groq.com/keys](https://console.groq.com/keys). Set `GROQ_API_KEY`. | Very fast Llama 3.3 70B. No live trend search |
| **Ollama** | Install [ollama.com](https://ollama.com), run `ollama pull llama3.1`, set `OLLAMA_MODEL=llama3.1` | Runs on your own computer: private, no limits, no internet needed |
| **Anthropic Claude** (paid, optional) | Create a key at [console.anthropic.com](https://console.anthropic.com). Set `ANTHROPIC_API_KEY` | The strongest writing, plus live trend checks with web search. Billed per use |

After adding a key, open **Setup** and click **Test AI**. It runs one real request and tells you which AI answered, or exactly what went wrong. Free tiers have rate limits that Google and Groq can change at any time; check your current limits in their dashboards. If the AI service fails or the free limit runs out, the app shows Basic mode results with a note explaining why, so you're never left with nothing. Any other OpenAI-compatible service (OpenRouter, LM Studio) works too, through `AI_BASE_URL`, `AI_API_KEY` and `AI_MODEL`.

## Connecting real accounts

Each platform needs a free developer app. The **Setup** page in the app lists the exact callback URL to paste into each one.

**Real posting needs a public HTTPS address.** Instagram, Facebook and TikTok download your media from the app, and Meta sends comment webhooks to it. Deploy the app to a server, or run a tunnel such as `ngrok http 3000` or Cloudflare Tunnel, then set `APP_URL` to that address.

| Platform | Where to create the app | What to enable | Env vars |
|---|---|---|---|
| Instagram | [Meta for Developers](https://developers.facebook.com/apps) → Business app → **Instagram API with Instagram Login** | Permissions: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_messages`. Webhook field: **comments** | `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` |
| Facebook | Same Meta app → **Facebook Login for Business** + **Pages API** | Permissions: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_engagement`, `pages_manage_metadata`, `pages_messaging`. Page webhook field: **feed**. If the dashboard gives you a *configuration ID*, set `META_LOGIN_CONFIG_ID` | `META_APP_ID`, `META_APP_SECRET` |
| Meta webhooks | Meta app → Webhooks (Instagram and Page objects) | Callback `APP_URL/api/webhooks/meta`, with any verify token you choose | `META_WEBHOOK_VERIFY_TOKEN` |
| TikTok | [TikTok for Developers](https://developers.tiktok.com/apps) | Login Kit + Content Posting API (Direct Post). Scopes: `user.info.basic`, `video.publish` | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` |
| YouTube | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) | Enable YouTube Data API v3. Create an OAuth client of type Web application | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| X | [X Developer Console](https://developer.x.com/en/portal/dashboard) | User authentication: OAuth 2.0, type Web App, read + write + DM | `X_CLIENT_ID`, `X_CLIENT_SECRET` |

Restart the app after changing env vars, then use **Connect** on the Accounts page. After connecting, click **Test** next to the account. It makes a safe read-only request and shows the account name, or the platform's exact error. Open the app at the same address as `APP_URL` when you connect, because the login comes back to that address and needs your session there.

### Platform approvals you should know about

These limits come from the platforms, not from this app:

- **Instagram and Facebook:** until Meta App Review approves your permissions, only people with a role on your Meta app (you and your testers) can connect. Instagram publishing only works with Professional (Business or Creator) accounts. A comment can get one private-reply DM, within 7 days of the comment. Instagram photos must be JPEG.
- **Instagram hashtags:** since December 2025, Instagram rejects posts with more than 5 hashtags. The app keeps the first 5 on Instagram, and other platforms get all of them, so put your best tags first ([report](https://techbuild.africa/instagram-posts-and-reels-to-five-hashtags/)). ([Meta docs](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing))
- **TikTok:** until your app passes TikTok's audit, posts are private ("Only me") and at most 5 accounts can post per day. ([TikTok docs](https://developers.tiktok.com/doc/content-sharing-guidelines))
- **YouTube:** videos uploaded by API projects that Google hasn't audited are locked to private. Each upload uses 1,600 of the default 10,000 daily quota units, so about 6 uploads a day.
- **X:** see Costs below.

## Costs

- **This app** is free.
- **Meta, TikTok and YouTube APIs** are free to use.
- **X** closed its free API tier to new projects in February 2026, according to reports, and now bills each call: about $0.015 per text post and about $0.20 per post with a link ([source](https://www.postproxy.dev/blog/x-api-pricing-2026/), third party; check current prices in the X developer console). Reading replies for reply automation is also billed, which is why `X_POLL_REPLIES` is off by default.
- **AI generator:** free. Gemini and Groq free tiers have daily and per-minute limits; Ollama and Basic mode have none.

## Deploying

Social Autopilot is a standard Next.js app that keeps its data in a SQLite file (`DATA_DIR`, default `./data`). It runs on any server or VPS with a persistent disk, for example Railway, Render, Fly.io or a $5 VPS.

- Run `npm run build` and then `npm start` behind HTTPS, and set `APP_URL` to the public address.
- A built-in timer publishes scheduled posts and checks YouTube/X comments every minute.
- Serverless hosts without a persistent disk (such as Vercel) need a different database, so they aren't supported as-is. If your host stops idle servers, set `CRON_SECRET` and call `GET /api/cron` with `Authorization: Bearer <CRON_SECRET>` every minute.
- Back up the `DATA_DIR` folder. It holds your posts, rules and encrypted platform tokens.

## Security

- The app has one user and a single password. Logins are rate-limited.
- Platform tokens are encrypted at rest (AES-256-GCM) with a key derived from `APP_SECRET`. Changing `APP_SECRET` logs you out and requires reconnecting accounts.
- Meta webhooks are checked against the `X-Hub-Signature-256` signature. Unsigned calls are rejected.
- Actions that change data only accept same-site requests, so other websites can't trigger them through your session.
- Uploaded media is served at `/media/<random-id>` without login, because the platforms have to download it. Don't upload anything you wouldn't post.

## Project layout

```
src/
  app/(app)/          Pages: dashboard, compose, posts, automations, generator, accounts, setup
  app/api/            Login, OAuth connect/callback, posts, automations, AI, Meta webhooks, cron
  app/media/[file]    Public media URLs for platforms to download
  lib/platforms/      One adapter per platform (OAuth, publish, reply, DM, comment polling)
  lib/publisher.ts    Publishing to all selected accounts, with retries and status
  lib/automation.ts   Keyword matching and comment → reply/DM handling
  lib/ai/             AI generator: Gemini (free), Groq/Ollama/OpenAI-compatible (free), Claude, automatic failover, Basic mode
  lib/scheduler.ts    Scheduled posts and YouTube/X comment polling
tests/                Unit tests (npm test)
```

## Development

```bash
npm run dev         # start in development mode
npm test            # unit tests
npm run typecheck   # TypeScript
```

## Status

Built and checked so far:

- 56 automated tests pass. They cover caption limits (including Instagram's 5 hashtags), keyword matching in any language and with emoji, webhook signatures, encryption and sessions. Fake-API tests check the exact requests each platform (Instagram, Facebook, TikTok, YouTube, X) and each AI service (Gemini, Groq/Ollama, Claude) sends, and how the app handles their answers and errors, including failover from one AI to the next.
- End to end with demo accounts: login, publishing, scheduling, webhook-triggered DMs, duplicate-comment protection, the cron endpoint, and both Test buttons.
- Google's real Gemini service was called with a wrong key: the app recognized the rejection, reported it clearly, and used Basic mode.

What can only be confirmed with your own keys and accounts: a real AI answer, and real posting, replies and DMs on each platform. The **Test AI** and per-account **Test** buttons check this in one click. If a platform rejects a post, the reason appears on the **Posts** page.

## Roadmap ideas

Multi-user workspaces, analytics, a content calendar, carousel posts, LinkedIn/Threads/Pinterest, and AI auto-replies.
