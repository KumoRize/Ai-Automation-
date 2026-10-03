"use client";

import { useState } from "react";

/** Calls a check endpoint and shows its plain-language result next to the button. */
export function TestButton({ url, label = "Test" }: { url: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(url, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      setResult({ ok: Boolean(data.ok), message: data.message ?? data.error ?? `HTTP ${res.status}` });
    } catch {
      setResult({ ok: false, message: "Couldn't reach the app." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-sm" onClick={run} disabled={busy}>
        {busy ? "Testing…" : label}
      </button>
      {result && (
        <span className={`text-xs ${result.ok ? "text-emerald-700" : "text-red-600"}`}>
          {result.ok ? "✓" : "✕"} {result.message}
        </span>
      )}
    </span>
  );
}
