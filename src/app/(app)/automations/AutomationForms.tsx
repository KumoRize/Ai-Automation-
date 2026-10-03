"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PLATFORM_LABELS, type Platform } from "@/lib/types";

interface PostOption {
  id: string;
  label: string;
}

export function AutomationForm({ platforms, posts }: { platforms: Platform[]; posts: PostOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<Platform>>(new Set(platforms));
  const [keywords, setKeywords] = useState("");
  const [matchMode, setMatchMode] = useState<"contains" | "exact" | "any">("contains");
  const [postId, setPostId] = useState("");
  const [publicReply, setPublicReply] = useState("Check your DMs, {name} 📩");
  const [dmMessage, setDmMessage] = useState("Hi {name}! Here's the link: {link}");
  const [includeLink, setIncludeLink] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        postId: postId || null,
        platforms: [...selected],
        keywords,
        matchMode,
        publicReply,
        dmMessage,
        includeLink,
      }),
    });
    setBusy(false);
    if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not save.");
    setName("");
    setKeywords("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="a-name">Name</label>
          <input id="a-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Free guide DM" />
        </div>
        <div>
          <label className="label" htmlFor="a-post">Applies to</label>
          <select id="a-post" className="input" value={postId} onChange={(e) => setPostId(e.target.value)}>
            <option value="">All posts</option>
            {posts.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <span className="label">Platforms</span>
        <div className="flex flex-wrap gap-3">
          {platforms.map((p) => (
            <label key={p} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={selected.has(p)}
                onChange={() => {
                  const next = new Set(selected);
                  if (next.has(p)) next.delete(p);
                  else next.add(p);
                  setSelected(next);
                }}
              />
              {PLATFORM_LABELS[p]}
            </label>
          ))}
        </div>
        <p className="hint">TikTok has no comment API. YouTube can only reply publicly (no DMs).</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <div>
          <label className="label" htmlFor="a-mode">Trigger when</label>
          <select id="a-mode" className="input" value={matchMode} onChange={(e) => setMatchMode(e.target.value as typeof matchMode)}>
            <option value="contains">Comment contains</option>
            <option value="exact">Comment is exactly</option>
            <option value="any">Any comment</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="a-kw">Keywords</label>
          <input
            id="a-kw"
            className="input"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            disabled={matchMode === "any"}
            placeholder="GUIDE, LINK, PRICE"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="a-reply">Public reply</label>
        <input id="a-reply" className="input" value={publicReply} onChange={(e) => setPublicReply(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="a-dm">Private message (DM)</label>
        <textarea id="a-dm" className="input" value={dmMessage} onChange={(e) => setDmMessage(e.target.value)} />
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeLink} onChange={(e) => setIncludeLink(e.target.checked)} />
          Add the post&apos;s link to the DM if {"{link}"} isn&apos;t in the message
        </label>
        <p className="hint">Use {"{name}"} for the commenter&apos;s name and {"{link}"} for the link saved on the post.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save automation"}</button>
    </form>
  );
}

interface TestResult {
  matched: { id: string; name: string } | null;
  publicReply: string | null;
  dm: string | null;
}

export function AutomationTester({ platforms, posts }: { platforms: Platform[]; posts: PostOption[] }) {
  const [platform, setPlatform] = useState<Platform>(platforms[0] ?? "instagram");
  const [postId, setPostId] = useState("");
  const [text, setText] = useState("Can I get the LINK please?");
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function test(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/automations/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, text, postId: postId || null }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "Test failed.");
    setResult(data);
  }

  return (
    <form onSubmit={test} className="space-y-3">
      <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
        {platforms.map((p) => (
          <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
        ))}
      </select>
      <select className="input" value={postId} onChange={(e) => setPostId(e.target.value)}>
        <option value="">Any post</option>
        {posts.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
      <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn w-full">Test comment</button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          {result.matched ? (
            <>
              <p className="font-medium text-emerald-700">Matches “{result.matched.name}”</p>
              <p className="mt-2"><span className="text-slate-500">Reply:</span> {result.publicReply ?? "(none)"}</p>
              <p className="mt-1 whitespace-pre-wrap"><span className="text-slate-500">DM:</span> {result.dm ?? "(none)"}</p>
            </>
          ) : (
            <p className="text-slate-600">No automation matches this comment.</p>
          )}
        </div>
      )}
    </form>
  );
}
