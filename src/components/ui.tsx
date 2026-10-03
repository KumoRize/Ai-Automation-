import { PLATFORM_LABELS, type Platform } from "@/lib/types";

const PLATFORM_STYLE: Record<Platform, string> = {
  instagram: "bg-pink-50 text-pink-700 ring-pink-200",
  facebook: "bg-blue-50 text-blue-700 ring-blue-200",
  tiktok: "bg-slate-900 text-white ring-slate-900",
  youtube: "bg-red-50 text-red-700 ring-red-200",
  x: "bg-slate-100 text-slate-900 ring-slate-300",
};

export function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${PLATFORM_STYLE[platform]}`}>
      {PLATFORM_LABELS[platform]}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  published: "bg-emerald-50 text-emerald-700",
  replied: "bg-emerald-50 text-emerald-700",
  simulated: "bg-violet-50 text-violet-700",
  scheduled: "bg-sky-50 text-sky-700",
  publishing: "bg-amber-50 text-amber-700",
  pending: "bg-amber-50 text-amber-700",
  partial: "bg-orange-50 text-orange-700",
  failed: "bg-red-50 text-red-700",
  no_match: "bg-slate-100 text-slate-500",
};

const STATUS_LABEL: Record<string, string> = { no_match: "no match" };

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] ?? "bg-slate-100"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Notice({ tone, children }: { tone: "error" | "success" | "warning" | "info"; children: React.ReactNode }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-sky-200 bg-sky-50 text-sky-900",
  };
  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles[tone]}`}>{children}</div>;
}

export function formatTime(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
