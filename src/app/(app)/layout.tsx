import { Sidebar } from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="mx-auto max-w-5xl px-4 py-8 md:ml-60 md:px-8">{children}</main>
    </div>
  );
}
