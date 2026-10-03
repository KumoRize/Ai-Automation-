"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/compose", label: "Create post" },
  { href: "/posts", label: "Posts" },
  { href: "/automations", label: "Automations" },
  { href: "/generator", label: "AI generator" },
  { href: "/accounts", label: "Accounts" },
  { href: "/setup", label: "Setup" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <aside className="border-b border-slate-200 bg-white md:fixed md:inset-y-0 md:w-60 md:border-b-0 md:border-r">
      <div className="flex items-center justify-between px-5 py-4 md:block">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">▲</span>
          Social Autopilot
        </Link>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        <button onClick={logout} className="whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-100 md:mt-4">
          Log out
        </button>
      </nav>
    </aside>
  );
}
