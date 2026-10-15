import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "配信収益ダッシュボード",
  description: "IRIAM・Avvy・Mirrativ の登録・収益・KPIを横断して確認する管理画面",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
