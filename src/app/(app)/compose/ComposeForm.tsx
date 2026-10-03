"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GeneratorPanel } from "@/components/GeneratorPanel";
import { PlatformBadge } from "@/components/ui";
import { PLATFORM_LABELS, type MediaType, type Platform } from "@/lib/types";

export interface Support {
  none: boolean;
  image: boolean;
  video: boolean;
  dm: boolean;
  reply: boolean;
}

interface Account {
  id: string;
  platform: Platform;
  username: string;
  demo: boolean;
}

export function ComposeForm({
  accounts,
  support,
  accept,
  maxUploadMb,
  aiEnabled,
}: {
  accounts: Account[];
  support: Record<Platform, Support>;
  accept: string;
  maxUploadMb: number;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [link, setLink] = useState("");
  const [linkInCaption, setLinkInCaption] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set(accounts.map((a) => a.id)));
  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [autoOn, setAutoOn] = useState(false);
  const [autoKeywords, setAutoKeywords] = useState("LINK");
  const [autoDm, setAutoDm] = useState("Hey {name}! Here's the link you asked for 👇 {link}");
  const [autoReply, setAutoReply] = useState("Just sent it to your DMs, {name} 📩");
  const [showAi, setShowAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaType: MediaType = !file ? "none" : file.type.startsWith("video/") ? "video" : "image";

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const unsupported = useMemo(
    () =>
      accounts.filter((a) => selected.has(a.id) && !support[a.platform][mediaType]).map((a) => a.platform),
    [accounts, selected, support, mediaType],
  );

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selected.size) return setError("Pick at least one account.");
    if (file && file.size > maxUploadMb * 1024 * 1024) return setError(`The file is larger than ${maxUploadMb} MB.`);
    if (when === "later" && !scheduledAt) return setError("Pick a date and time, or choose Post now.");

    const form = new FormData();
    if (file) form.append("file", file);
    form.append("title", title);
    form.append("caption", caption);
    form.append("link", link);
    form.append("linkInCaption", linkInCaption ? "1" : "0");
    selected.forEach((id) => form.append("accountIds", id));
    if (when === "later") form.append("scheduledAt", new Date(scheduledAt).toISOString());
    if (autoOn) {
      form.append("autoKeywords", autoKeywords);
      form.append("autoDm", autoDm);
      form.append("autoReply", autoReply);
    }

    setBusy(true);
    try {
      const res = await fetch("/api/posts", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not create the post.");
      router.push("/posts");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const xLength = [...caption].length + (link && linkInCaption ? 25 : 0);

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        <div className="card space-y-4">
          <div>
            <label className="label">Photo or video</label>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:border-brand-500">
              {preview && mediaType === "image" && (
                <img src={preview} alt="" className="mb-3 max-h-56 rounded-lg" />
              )}
              {preview && mediaType === "video" && <video src={preview} className="mb-3 max-h-56 rounded-lg" controls />}
              <span className="text-sm font-medium text-slate-700">{file ? file.name : "Click to choose a file"}</span>
              <span className="text-xs text-slate-500">JPEG, PNG, MP4 or MOV, up to {maxUploadMb} MB. Leave empty for a text post.</span>
              <input type="file" accept={accept} className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            {file && (
              <button type="button" className="mt-2 text-xs text-slate-500 underline" onClick={() => setFile(null)}>
                Remove file
              </button>
            )}
          </div>

          <div>
            <label className="label" htmlFor="title">Title <span className="font-normal text-slate-400">(YouTube and TikTok)</span></label>
            <input id="title" className="input" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional. The first line of the caption is used if empty." />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="label mb-0" htmlFor="caption">Caption</label>
              <button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={() => setShowAi(!showAi)}>
                {showAi ? "Hide AI" : "✨ Write with AI"}
              </button>
            </div>
            <textarea id="caption" className="input min-h-36" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write your caption, hashtags included." />
            <p className={`hint ${xLength > 280 ? "text-amber-600" : ""}`}>
              {[...caption].length} characters.{" "}
              {xLength > 280 ? "Too long for X, so it will be shortened there with “…”." : "Fits on X."}
            </p>
          </div>

          {showAi && (
            <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
              {aiEnabled ? (
                <GeneratorPanel
                  initialTopic={caption}
                  onUseCaption={(text) => {
                    setCaption(text);
                    setShowAi(false);
                  }}
                  onUseTitle={setTitle}
                />
              ) : (
                <p className="text-sm text-slate-600">Set ANTHROPIC_API_KEY to turn on the AI generator.</p>
              )}
            </div>
          )}

          <div>
            <label className="label" htmlFor="link">Link</label>
            <input id="link" className="input" type="text" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://your-shop.com/product" />
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={linkInCaption} onChange={(e) => setLinkInCaption(e.target.checked)} />
              Add the link to the caption
            </label>
            <p className="hint">Instagram and TikTok don&apos;t make caption links clickable. Use the keyword DM below to send the link there.</p>
          </div>
        </div>

        <div className="card space-y-4">
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block font-medium">Keyword DM automation</span>
              <span className="text-sm text-slate-500">When someone comments a keyword on this post, send them a DM with the link, ManyChat-style.</span>
            </span>
            <input type="checkbox" className="h-5 w-5" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} />
          </label>
          {autoOn && (
            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="kw">Keywords</label>
                <input id="kw" className="input" value={autoKeywords} onChange={(e) => setAutoKeywords(e.target.value)} placeholder="LINK, GUIDE, PRICE" />
                <p className="hint">Comma-separated. Not case-sensitive; matches whole words.</p>
              </div>
              <div>
                <label className="label" htmlFor="dm">Private message</label>
                <textarea id="dm" className="input" value={autoDm} onChange={(e) => setAutoDm(e.target.value)} />
                <p className="hint">{"{name}"} is the commenter&apos;s name and {"{link}"} is your link. Sent on Instagram, Facebook and X.</p>
              </div>
              <div>
                <label className="label" htmlFor="reply">Public reply</label>
                <input id="reply" className="input" value={autoReply} onChange={(e) => setAutoReply(e.target.value)} />
                <p className="hint">Posted under the comment so others see it worked. Leave empty to skip.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="card space-y-3">
          <p className="font-medium">Post to</p>
          {accounts.map((a) => {
            const ok = support[a.platform][mediaType];
            return (
              <label key={a.id} className={`flex items-center gap-3 rounded-lg border p-2.5 text-sm ${selected.has(a.id) ? "border-brand-500 bg-brand-50/50" : "border-slate-200"}`}>
                <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
                <PlatformBadge platform={a.platform} />
                <span className="min-w-0 truncate">{a.username}</span>
                {!ok && <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-amber-600">✕ {mediaType === "none" ? "needs media" : mediaType}</span>}
              </label>
            );
          })}
          {unsupported.length > 0 && (
            <p className="text-xs text-amber-700">
              {[...new Set(unsupported)].map((p) => PLATFORM_LABELS[p]).join(", ")} can&apos;t take this kind of post and will be marked failed. Untick them or change the file.
            </p>
          )}
        </div>

        <div className="card space-y-3">
          <p className="font-medium">When</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={when === "now"} onChange={() => setWhen("now")} /> Post now
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={when === "later"} onChange={() => setWhen("later")} /> Schedule
          </label>
          {when === "later" && (
            <input type="datetime-local" className="input" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn btn-primary w-full py-3" disabled={busy}>
          {busy ? "Uploading…" : when === "now" ? `Publish to ${selected.size} account${selected.size === 1 ? "" : "s"}` : "Schedule post"}
        </button>
      </div>
    </form>
  );
}
