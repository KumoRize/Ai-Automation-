import Link from "next/link";
import { connection } from "next/server";
import { listAccounts } from "@/lib/accounts";
import { aiConfigured } from "@/lib/ai";
import { ACCEPT_ATTR, MAX_UPLOAD_BYTES } from "@/lib/media";
import { adapters } from "@/lib/platforms";
import { PLATFORMS, type Platform } from "@/lib/types";
import { EmptyState } from "@/components/ui";
import { ComposeForm, type Support } from "./ComposeForm";

export default async function ComposePage() {
  await connection();
  const accounts = listAccounts();
  const support = Object.fromEntries(
    PLATFORMS.map((p) => {
      const c = adapters[p].capabilities;
      return [p, { none: c.text, image: c.image, video: c.video, dm: c.privateReply, reply: c.publicReply }];
    }),
  ) as Record<Platform, Support>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Create post</h1>
        <p className="text-sm text-slate-500">Upload once, pick your channels, and publish everywhere at the same time.</p>
      </div>
      {accounts.length === 0 ? (
        <EmptyState title="Connect an account first">
          <Link href="/accounts" className="underline">Go to Accounts</Link> to connect a channel or add a demo account.
        </EmptyState>
      ) : (
        <ComposeForm
          accounts={accounts.map((a) => ({ id: a.id, platform: a.platform, username: a.username, demo: Boolean(a.demo) }))}
          support={support}
          accept={ACCEPT_ATTR}
          maxUploadMb={Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}
          aiEnabled={aiConfigured()}
        />
      )}
    </div>
  );
}
