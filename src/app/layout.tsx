import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "VTuber活動ロードマップ",
  description: "VTuber活動開始までの進捗を管理するスタンプラリー型ロードマップ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen text-gray-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
