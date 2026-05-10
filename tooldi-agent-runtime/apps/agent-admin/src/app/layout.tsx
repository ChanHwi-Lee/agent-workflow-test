import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AGW Result Dashboard",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-zinc-50 text-zinc-900 min-h-screen">{children}</body>
    </html>
  );
}
