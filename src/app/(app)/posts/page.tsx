import Link from "next/link";
import { connection } from "next/server";
import { listPosts } from "@/lib/publisher";
import { ActionButton } from "@/components/ActionButton";
import { AutoRefresh } from "@/components/AutoRefresh";
import { EmptyState, formatTime, PlatformBadge, StatusPill } from "@/components/ui";

export default async function PostsPage() {
  await connection();
  const posts = listPosts(100);
  const inProgress = posts.some((p) => p.status === "publishing");

  return (
    <div className="space-y-6">
      <AutoRefresh active={inProgress} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Posts</h1>
          <p className="text-sm text-slate-500">Where each post went and whether it went live.</p>
        </div>
        <Link href="/compose" className="btn btn-primary">+ Create post</Link>
      </div>

      {posts.length === 0 ? (
        <EmptyState title="No posts yet">
          <Link href="/compose" className="underline">Create your first post</Link>.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {posts.map((p) => {
            const failed = p.targets.some((t) => t.status === "failed");
            return (
              <li key={p.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <StatusPill status={p.status} />
                      <span className="text-xs text-slate-400">
                        {p.status === "scheduled" ? `Scheduled for ${formatTime(p.scheduled_at)}` : formatTime(p.created_at)}
                      </span>
                      {p.media_type !== "none" && <span className="text-xs text-slate-400">· {p.media_type}</span>}
                    </div>
                    {p.title && <p className="mt-2 font-medium">{p.title}</p>}
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">{p.caption || "(no caption)"}</p>
                    {p.link && <p className="mt-1 truncate text-xs text-brand-600">{p.link}</p>}
                  </div>
                  <div className="flex gap-2">
                    {(failed || p.status === "scheduled") && (
                      <ActionButton url={`/api/posts/${p.id}/publish`}>
                        {p.status === "scheduled" ? "Publish now" : "Retry failed"}
                      </ActionButton>
                    )}
                    <ActionButton
                      url={`/api/posts/${p.id}`}
                      method="DELETE"
                      confirm="Remove this post from the app? Posts already live on a platform are not deleted there."
                      className="btn btn-sm btn-danger"
                    >
                      Remove
                    </ActionButton>
                  </div>
                </div>

                <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
                  {p.targets.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                      <PlatformBadge platform={t.platform} />
                      <span className="text-slate-600">{t.username}</span>
                      <StatusPill status={t.status} />
                      {t.external_url && (
                        <a href={t.external_url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                          View post ↗
                        </a>
                      )}
                      {t.error && <span className="basis-full text-xs text-red-600">{t.error}</span>}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
