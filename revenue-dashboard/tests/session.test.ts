import { test } from "node:test";
import assert from "node:assert/strict";
import { createSessionToken, safeNextPath, verifyPassword, verifySessionToken } from "../src/lib/session";

process.env.DASHBOARD_PASSWORD = "pass-1";
process.env.DASHBOARD_SESSION_SECRET = "secret-1";

test("パスワード照合", async () => {
  assert.equal(await verifyPassword("pass-1"), true);
  assert.equal(await verifyPassword("pass-2"), false);
  assert.equal(await verifyPassword(""), false);
});

test("セッショントークンの署名・期限・改ざん検知", async () => {
  const now = Date.now();
  const token = await createSessionToken(now);
  assert.equal(await verifySessionToken(token, now), true);
  assert.equal(await verifySessionToken(token, now + 31 * 24 * 3600 * 1000), false);
  const [exp, sig] = token.split(".");
  assert.equal(await verifySessionToken(`${Number(exp) + 1000}.${sig}`, now), false);
  assert.equal(await verifySessionToken("garbage", now), false);
  process.env.DASHBOARD_SESSION_SECRET = "rotated";
  assert.equal(await verifySessionToken(token, now), false);
  process.env.DASHBOARD_SESSION_SECRET = "secret-1";
});

test("ログイン後の遷移先は同一サイト内のパスのみ", () => {
  assert.equal(safeNextPath("/kpi?p=prev"), "/kpi?p=prev");
  assert.equal(safeNextPath("//evil.example"), "/");
  assert.equal(safeNextPath("https://evil.example"), "/");
  assert.equal(safeNextPath(undefined), "/");
});
