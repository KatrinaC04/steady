import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Steady Live Companion",
  description: "Best Answer retrieval for consented Teams mock interviews.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
