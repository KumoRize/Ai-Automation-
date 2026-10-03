import Link from "next/link";
import { connection } from "next/server";
import { aiStatus } from "@/lib/ai";
import { GeneratorPanel } from "@/components/GeneratorPanel";
import { Notice } from "@/components/ui";

export default async function GeneratorPage() {
  await connection();
  const ai = aiStatus();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">AI generator</h1>
        <p className="text-sm text-slate-500">
          Describe your post and get trending hashtags, search keywords and a caption in your style.
        </p>
      </div>
      {ai.problem && <Notice tone="error">{ai.problem} Using Basic mode until it&apos;s fixed.</Notice>}
      {ai.provider === "basic" && !ai.problem && (
        <Notice tone="info">
          You&apos;re in Basic mode, which works without any key but only uses templates. For real AI captions and
          live trending hashtags, add a free Google Gemini key. See <Link href="/setup" className="underline">Setup</Link>.
        </Notice>
      )}
      <div className="card">
        <GeneratorPanel providerLabel={ai.label} canCheckTrends={ai.liveTrends} />
      </div>
    </div>
  );
}
