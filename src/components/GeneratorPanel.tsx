"use client";

import { useState } from "react";

interface Result {
  caption: string;
  hook: string;
  title: string;
  hashtags: string[];
  keywords: string[];
  styleNotes: string;
  sources: { title: string; url: string }[];
  provider: string;
  liveChecked: boolean;
  notice?: string;
}

const STYLES = ["Witty", "Luxury", "Gen Z", "Professional", "Storytelling", "Minimal", "Motivational"];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function GeneratorPanel({
  initialTopic = "",
  providerLabel,
  canCheckTrends,
  onUseCaption,
  onUseTitle,
}: {
  initialTopic?: string;
  /** Name of the AI engine in use, e.g. "Google Gemini (free tier)". */
  providerLabel: string;
  /** Whether the engine can search the web for live trends. */
  canCheckTrends: boolean;
  /** When set (inside the composer), results get "Use" buttons instead of only "Copy". */
  onUseCaption?: (text: string) => void;
  onUseTitle?: (title: string) => void;
}) {
  const [topic, setTopic] = useState(initialTopic);
  const [style, setStyle] = useState("");
  const [language, setLanguage] = useState("English");
  const [liveTrends, setLiveTrends] = useState(canCheckTrends);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, style, language, liveTrends: canCheckTrends && liveTrends }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed.");
      setResult(data);
      setPicked(new Set(data.hashtags));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const hashtagText = result ? result.hashtags.filter((h) => picked.has(h)).join(" ") : "";
  const fullCaption = result ? `${result.hook}\n\n${result.caption}\n\n${hashtagText}`.trim() : "";

  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="gen-topic">What is the post about?</label>
        <textarea
          id="gen-topic"
          className="input min-h-20"
          placeholder="e.g. 5-minute morning skincare routine for oily skin, product: our new vitamin C serum"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor="gen-style">Style</label>
        <input
          id="gen-style"
          className="input"
          placeholder="Describe your voice, or pick one below"
          value={style}
          onChange={(e) => setStyle(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {STYLES.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => setStyle(s)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${style === s ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-40">
          <label className="label" htmlFor="gen-lang">Language</label>
          <input id="gen-lang" className="input" value={language} onChange={(e) => setLanguage(e.target.value)} />
        </div>
        {canCheckTrends ? (
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={liveTrends} onChange={(e) => setLiveTrends(e.target.checked)} />
            Check live trends with Google Search (slower, more current)
          </label>
        ) : (
          <p className="pb-2 text-xs text-slate-500">Live trend search needs a free Gemini key.</p>
        )}
      </div>
      <button type="button" className="btn btn-primary" onClick={generate} disabled={busy || topic.trim().length < 2}>
        {busy ? (canCheckTrends && liveTrends ? "Researching trends and writing…" : "Writing…") : "✨ Generate"}
      </button>
      <p className="text-xs text-slate-500">Using: {providerLabel}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          {result.notice && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{result.notice}</p>}
          <section>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Caption</h3>
              <div className="flex gap-2">
                <CopyButton text={fullCaption} />
                {onUseCaption && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => onUseCaption(fullCaption)}>
                    Use caption + hashtags
                  </button>
                )}
              </div>
            </div>
            <p className="whitespace-pre-wrap rounded-lg bg-white p-3 text-sm">
              <strong>{result.hook}</strong>
              {"\n\n"}
              {result.caption}
            </p>
          </section>

          <section>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Title</h3>
              <div className="flex gap-2">
                <CopyButton text={result.title} />
                {onUseTitle && (
                  <button type="button" className="btn btn-sm" onClick={() => onUseTitle(result.title)}>Use</button>
                )}
              </div>
            </div>
            <p className="rounded-lg bg-white p-3 text-sm">{result.title}</p>
          </section>

          <section>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Hashtags <span className="font-normal text-slate-500">(click to include or drop)</span></h3>
              <CopyButton text={hashtagText} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {result.hashtags.map((h) => (
                <button
                  type="button"
                  key={h}
                  onClick={() => {
                    const next = new Set(picked);
                    if (next.has(h)) next.delete(h);
                    else next.add(h);
                    setPicked(next);
                  }}
                  className={`rounded-full px-2.5 py-0.5 text-xs ${picked.has(h) ? "bg-brand-600 text-white" : "bg-white text-slate-400 line-through ring-1 ring-slate-200"}`}
                >
                  {h}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Trending keywords</h3>
              <CopyButton text={result.keywords.join(", ")} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {result.keywords.map((k) => (
                <span key={k} className="rounded-full bg-white px-2.5 py-0.5 text-xs ring-1 ring-slate-200">{k}</span>
              ))}
            </div>
          </section>

          <p className="text-xs text-slate-500"><strong>Style notes:</strong> {result.styleNotes}</p>
          <p className="text-xs text-slate-500">
            Written by {result.provider}.{" "}
            {result.liveChecked
              ? "Hashtags were checked against current web results."
              : "Hashtags were not checked against live trends, so double-check them before posting."}
          </p>
          {result.sources.length > 0 && (
            <div className="text-xs text-slate-500">
              <strong>Trend sources:</strong>
              <ul className="mt-1 list-disc pl-5">
                {result.sources.map((s) => (
                  <li key={s.url}>
                    <a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
