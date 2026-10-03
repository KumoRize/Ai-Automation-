"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** A button that calls an API route, then refreshes the page. */
export function ActionButton({
  url,
  method = "POST",
  body,
  confirm,
  className = "btn btn-sm",
  children,
}: {
  url: string;
  method?: "POST" | "PATCH" | "DELETE";
  body?: unknown;
  confirm?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        window.alert(data.error ?? "Something went wrong.");
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className={className} onClick={run} disabled={busy}>
      {busy ? "…" : children}
    </button>
  );
}
