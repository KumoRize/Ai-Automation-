import { connection } from "next/server";
import { listAutomations, listCommentEvents } from "@/lib/automation";
import { adapters } from "@/lib/platforms";
import { listPosts } from "@/lib/publisher";
import { PLATFORMS, type Platform } from "@/lib/types";
import { ActionButton } from "@/components/ActionButton";
import { EmptyState, formatTime, PlatformBadge, StatusPill } from "@/components/ui";
import { AutomationForm, AutomationTester } from "./AutomationForms";

export default async function AutomationsPage() {
  await connection();
  const automations = listAutomations();
  const events = listCommentEvents(30);
  const posts = listPosts(50).map((p) => ({
    id: p.id,
    label: (p.title || p.caption || "(media only)").slice(0, 60),
  }));
  const supported = PLATFORMS.filter((p) => adapters[p].capabilities.commentSource !== "none");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Comment automations</h1>
        <p className="text-sm text-slate-500">
          When a comment contains your keyword, reply publicly and/or send a DM with your link automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card">
          <h2 className="mb-4 font-semibold">New automation</h2>
          <AutomationForm platforms={supported} posts={posts} />
        </div>
        <div className="card h-fit">
          <h2 className="mb-1 font-semibold">Test a comment</h2>
          <p className="mb-4 text-xs text-slate-500">See what would be sent. Nothing is posted.</p>
          <AutomationTester platforms={supported} posts={posts} />
        </div>
      </div>

      <section>
        <h2 className="mb-3 font-semibold">Your automations</h2>
        {automations.length === 0 ? (
          <EmptyState title="No automations yet">Create one above, or turn on the keyword DM when you create a post.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {automations.map((a) => {
              const platforms = JSON.parse(a.platforms) as Platform[];
              const keywords = JSON.parse(a.keywords) as string[];
              return (
                <li key={a.id} className={`card ${a.active ? "" : "opacity-60"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="font-medium">{a.name}</p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {platforms.map((p) => <PlatformBadge key={p} platform={p} />)}
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-600">
                          {a.match_mode === "any"
                            ? "Every comment"
                            : `${a.match_mode === "exact" ? "Comment is exactly" : "Comment contains"}: ${keywords.join(", ")}`}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-600">{a.post_id ? `Only on “${(a.post_caption ?? "").slice(0, 40)}”` : "All posts"}</span>
                      </div>
                      {a.public_reply && <p className="text-sm"><span className="text-slate-500">Reply:</span> {a.public_reply}</p>}
                      {a.dm_message && <p className="text-sm"><span className="text-slate-500">DM:</span> {a.dm_message}</p>}
                      <p className="text-xs text-slate-400">Triggered {a.trigger_count} time{a.trigger_count === 1 ? "" : "s"}</p>
                    </div>
                    <div className="flex gap-2">
                      <ActionButton url={`/api/automations/${a.id}`} method="PATCH" body={{ active: !a.active }}>
                        {a.active ? "Pause" : "Resume"}
                      </ActionButton>
                      <ActionButton url={`/api/automations/${a.id}`} method="DELETE" confirm="Delete this automation?" className="btn btn-sm btn-danger">
                        Delete
                      </ActionButton>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Activity log</h2>
        {events.length === 0 ? (
          <EmptyState title="No comments received yet" />
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Where</th>
                  <th className="px-4 py-2">Comment</th>
                  <th className="px-4 py-2">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{formatTime(e.created_at)}</td>
                    <td className="px-4 py-2"><PlatformBadge platform={e.platform} /></td>
                    <td className="px-4 py-2">
                      <span className="font-medium">{e.author_name ?? "Someone"}:</span> {e.text}
                      {e.automation_name && <p className="text-xs text-slate-400">Rule: {e.automation_name}</p>}
                    </td>
                    <td className="px-4 py-2">
                      <StatusPill status={e.result} />
                      {e.detail && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{e.detail}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
