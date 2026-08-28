// 管理画面用の簡易セッション認証。
// Edge(middleware)でもNode(Server Actions)でも動くようWeb Crypto(SubtleCrypto)を使用する。

export const ADMIN_COOKIE_NAME = "admin_session";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14日
export const ADMIN_COOKIE_MAX_AGE_SECONDS = MAX_AGE_MS / 1000;

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "ADMIN_SESSION_SECRET が設定されていません。.env を確認してください。"
    );
  }
  return secret;
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function checkAdminPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return input === expected;
}

export async function createSessionToken(): Promise<string> {
  const timestamp = Date.now().toString();
  const signature = await hmac(timestamp);
  return `${timestamp}.${signature}`;
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<boolean> {
  if (!token) return false;
  const [timestamp, signature] = token.split(".");
  if (!timestamp || !signature) return false;

  const age = Date.now() - Number(timestamp);
  if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return false;

  const expectedSignature = await hmac(timestamp);
  if (expectedSignature.length !== signature.length) return false;

  let mismatch = 0;
  for (let i = 0; i < expectedSignature.length; i++) {
    mismatch |= expectedSignature.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}
