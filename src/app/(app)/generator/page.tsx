import { connection } from "next/server";
import { aiConfigured } from "@/lib/ai";
import { GeneratorPanel } from "@/components/GeneratorPanel";
import { Notice } from "@/components/ui";

export default async function GeneratorPage() {
  await connection();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">AI generator</h1>
        <p className="text-sm text-slate-500">
          Describe your post and get trending hashtags, search keywords and a caption in your style.
        </p>
      </div>
      {!aiConfigured() && <Notice tone="warning">Set ANTHROPIC_API_KEY in your environment to turn on the generator.</Notice>}
      <div className="card">
        <GeneratorPanel />
      </div>
    </div>
  );
}
