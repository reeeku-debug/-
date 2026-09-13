import { headers } from "next/headers";

/** サーバーコンポーネントから現在のオリジン(https://xxx.vercel.app 等)を取得する */
export function getRequestOrigin(): string {
  const headersList = headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const proto = headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
