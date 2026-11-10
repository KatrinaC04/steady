import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Steady — AI Mock Interview",
  description: "Private, real-time interview practice without forced playback.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
