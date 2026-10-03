import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Social Autopilot",
  description: "Post once to Instagram, Facebook, TikTok, YouTube and X, and automate comment replies.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
