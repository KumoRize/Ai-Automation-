import Link from "next/link";
import { connection } from "next/server";
import { listAccounts } from "@/lib/accounts";
import { listAutomations, listCommentEvents } from "@/lib/automation";
import { listPosts } from "@/lib/publisher";
import { EmptyState, formatTime, PlatformBadge, StatusPill } from "@/components/ui";

export default async function Dashboard() {
  await connection();
  const accounts = listAccounts();
  const posts = listPosts(5);
  const automations = listAutomations();
  const events = listCommentEvents(5);
  const live = posts.flatMap((p) => p.targets).filter((t) => t.status === "published").length;

  const stats = [
    { label: "Connected accounts", value: accounts.length, href: "/accounts" },
    { label: "Recent posts live", value: live, href: "/posts" },
    { label: "Active automations", value: automations.filter((a) => a.active).length, href: "/automations" },
    { label: "Comments answered", value: automations.reduce((n, a) => n + a.trigger_count, 0), href: "/automations" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-slate-500">Post once to every channel and let keyword automations answer comments.</p>
        </div>
        <Link href="/compose" className="btn btn-primary">+ Create post</Link>
      </div>

      {accounts.length === 0 && (
        <div className="card border-brand-100 bg-brand-50">
          <p className="font-medium">Start here</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li><Link className="underline" href="/accounts">Connect your accounts</Link> (or add demo accounts to try the app first).</li>
            <li><Link className="underline" href="/compose">Create a post</Link> and pick where it goes.</li>
            <li><Link className="underline" href="/automations">Add a keyword automation</Link> so comments like &ldquo;LINK&rdquo; get an automatic DM.</li>
          </ol>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card hover:border-brand-200">
            <p className="text-3xl font-semibold">{s.value}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </Link>
        ))}
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-semibold">Recent posts</h2>
          {posts.length === 0 ? (
            <EmptyState title="No posts yet" />
          ) : (
            <ul className="space-y-3">
              {posts.map((p) => (
                <li key={p.id} className="card py-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-2 text-sm">{p.title || p.caption || "(media only)"}</p>
                    <StatusPill status={p.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.targets.map((t) => <PlatformBadge key={t.id} platform={t.platform} />)}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{formatTime(p.scheduled_at ?? p.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="mb-3 font-semibold">Latest comment activity</h2>
          {events.length === 0 ? (
            <EmptyState title="No comments handled yet">Comments on your posts show up here once an automation is set up.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {events.map((e) => (
                <li key={e.id} className="card py-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <PlatformBadge platform={e.platform} />
                      <span className="text-sm font-medium">{e.author_name ?? "Someone"}</span>
                    </div>
                    <StatusPill status={e.result} />
                  </div>
                  <p className="mt-2 text-sm text-slate-600">&ldquo;{e.text}&rdquo;</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
