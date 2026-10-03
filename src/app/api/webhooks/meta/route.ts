import { after, type NextRequest } from "next/server";
import { handleComment } from "@/lib/automation";
import { config } from "@/lib/config";
import { parseMetaComments, verifyMetaSignature } from "@/lib/webhooks";

/** Meta calls this once with a challenge when you save the webhook URL in the developer dashboard. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const token = config.metaWebhookVerifyToken;
  if (q.get("hub.mode") === "subscribe" && token && q.get("hub.verify_token") === token) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/** New Instagram and Facebook Page comments arrive here. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const secrets = [config.facebook.appSecret, config.instagram.appSecret];
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), secrets)) {
    return new Response("Invalid signature", { status: 401 });
  }
  let comments;
  try {
    comments = parseMetaComments(JSON.parse(raw));
  } catch {
    return new Response("Bad payload", { status: 400 });
  }
  // Answer Meta right away; replies and DMs are sent after the response.
  after(async () => {
    for (const comment of comments) {
      try {
        await handleComment(comment);
      } catch (err) {
        console.error("[webhook] comment handling failed:", err);
      }
    }
  });
  return new Response("OK", { status: 200 });
}
