// パスワード1つで入るシンプルなログイン。
// セッションは「有効期限.HMAC署名」を httpOnly Cookie に保存する（DB不要）。
// Web Crypto を使うので middleware（Edge）とサーバー（Node）の両方で動く。

export const SESSION_COOKIE = "rd_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30日

const encoder = new TextEncoder();

function sessionSecret(): string | null {
  const secret = process.env.DASHBOARD_SESSION_SECRET?.trim() || process.env.DASHBOARD_PASSWORD?.trim();
  return secret || null;
}

export function isLoginConfigured(): boolean {
  return !!process.env.DASHBOARD_PASSWORD?.trim();
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

/** 長さが違っても処理時間が変わりにくい比較 */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const secret = sessionSecret();
  if (!secret) throw new Error("DASHBOARD_PASSWORD が設定されていません");
  const expires = String(now + SESSION_MAX_AGE * 1000);
  return `${expires}.${await hmac(expires, secret)}`;
}

export async function verifySessionToken(token: string | undefined | null, now = Date.now()): Promise<boolean> {
  const secret = sessionSecret();
  if (!secret || !token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || !/^\d+$/.test(expires) || Number(expires) < now) return false;
  return safeEqual(signature, await hmac(expires, secret));
}

export async function verifyPassword(input: string): Promise<boolean> {
  const expected = process.env.DASHBOARD_PASSWORD?.trim();
  if (!expected) return false;
  // ハッシュ同士を比較して長さの差による情報漏れを防ぐ
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(input)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return safeEqual(toHex(a), toHex(b));
}

/** ログイン後の遷移先として安全なパスだけを許可 */
export function safeNextPath(value: unknown): string {
  const s = typeof value === "string" ? value : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/";
}
