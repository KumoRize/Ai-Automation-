import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isValidSessionValue, SESSION_COOKIE } from "@/lib/auth";
import { configProblems } from "@/lib/config";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  await connection();
  const problems = configProblems();
  if (!problems.length && isValidSessionValue((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/");
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-xl text-white">▲</div>
          <h1 className="text-xl font-semibold">Social Autopilot</h1>
          <p className="text-sm text-slate-500">Post once. Go live everywhere.</p>
        </div>
        {problems.length > 0 ? (
          <div className="card text-sm">
            <p className="mb-2 font-medium text-red-700">Finish setup before logging in:</p>
            <ul className="list-disc space-y-1 pl-5 text-slate-700">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="mt-3 text-slate-500">Copy <code>.env.example</code> to <code>.env.local</code>, fill it in, and restart.</p>
          </div>
        ) : (
          <LoginForm />
        )}
      </div>
    </main>
  );
}
