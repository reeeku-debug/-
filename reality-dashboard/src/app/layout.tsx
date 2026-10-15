import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "REALITY ティア判定",
  description: "REALITY の配信レポートCSVを取り込み、月ごとにT1〜T5のティアを自動判定して確認する管理画面",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
