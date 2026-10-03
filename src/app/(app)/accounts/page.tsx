import { connection } from "next/server";
import { listAccounts } from "@/lib/accounts";
import { adapters } from "@/lib/platforms";
import { PLATFORMS, PLATFORM_LABELS } from "@/lib/types";
import { ActionButton } from "@/components/ActionButton";
import { Notice, PlatformBadge } from "@/components/ui";

export default async function AccountsPage({ searchParams }: PageProps<"/accounts">) {
  await connection();
  const q = await searchParams;
  const accounts = listAccounts();
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Accounts</h1>
        <p className="text-sm text-slate-500">
          Connect each channel once. Demo accounts let you try every feature without real posting.
        </p>
      </div>

      {one(q.error) && <Notice tone="error">{one(q.error)}</Notice>}
      {one(q.warning) && <Notice tone="warning">{one(q.warning)}</Notice>}
      {one(q.connected) && (
        <Notice tone="success">
          {one(q.connected) === "demo" ? "Demo account added." : `Connected ${one(q.connected)} account(s).`}
        </Notice>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {PLATFORMS.map((platform) => {
          const a = adapters[platform];
          const connected = accounts.filter((acc) => acc.platform === platform);
          const configured = a.isConfigured();
          return (
            <div key={platform} className="card flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <PlatformBadge platform={platform} />
                <span className={`text-xs ${configured ? "text-emerald-600" : "text-slate-400"}`}>
                  {configured ? "API keys set" : "API keys not set"}
                </span>
              </div>

              {connected.length > 0 ? (
                <ul className="divide-y divide-slate-100 text-sm">
                  {connected.map((acc) => (
                    <li key={acc.id} className="flex items-center justify-between py-2">
                      <span>
                        {acc.username}
                        {acc.demo ? <span className="ml-2 rounded bg-violet-50 px-1.5 py-0.5 text-xs text-violet-700">demo</span> : null}
                      </span>
                      <ActionButton
                        url={`/api/accounts/${acc.id}`}
                        method="DELETE"
                        confirm={`Disconnect ${acc.username}? Its posts and automations stay, but nothing more is sent from it.`}
                        className="btn btn-sm btn-danger"
                      >
                        Disconnect
                      </ActionButton>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No {PLATFORM_LABELS[platform]} account connected.</p>
              )}

              <div className="mt-auto flex flex-wrap gap-2">
                {configured ? (
                  <a href={`/api/connect/${platform}`} className="btn btn-primary btn-sm">
                    Connect {PLATFORM_LABELS[platform]}
                  </a>
                ) : (
                  <a href="/setup" className="btn btn-sm">How to connect</a>
                )}
                <form method="post" action={`/api/connect/${platform}`}>
                  <button className="btn btn-sm">Add demo account</button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
