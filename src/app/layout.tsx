import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "REALITY新規登録管理",
  description: "REALITY新規登録者管理ダッシュボード",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
