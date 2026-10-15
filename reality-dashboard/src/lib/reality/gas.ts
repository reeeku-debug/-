// Google Apps Script（ウェブアプリ）経由で REALITY のスプレッドシートを読み書きする。
// スクリプト本体は reality-tier/REALITY_日次取込.gs（doPost）。

import type { Criteria, MonthlyRow } from "./tier";

export interface GasConfig {
  url: string;
  token: string;
}

/** GAS_WEBAPP_URL / GAS_TOKEN。未設定なら null、形式がおかしければエラー */
export function readGasConfig(env: NodeJS.ProcessEnv = process.env): GasConfig | null {
  const url = env.GAS_WEBAPP_URL?.trim();
  const token = env.GAS_TOKEN?.trim();
  if (!url || !token) return null;
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) {
    throw new Error("GAS_WEBAPP_URL は https://script.google.com/macros/s/…/exec の形式で指定してください");
  }
  if (url.includes("/library/") || /\/dev(\?|$)/.test(url)) {
    throw new Error("GAS_WEBAPP_URL にテスト用（/dev）などのURLが設定されています。「ウェブアプリ」のURL（/exec で終わるもの）を設定してください");
  }
  return { url, token };
}

export interface RealityData {
  months: MonthlyRow[];
  /** 月ごとの「何日分まで取り込んだか」（日次取込の最新の終了日） */
  periods: Record<string, string>;
  /** タレントマスタ：[ID, 配信者名, 担当者, メモ] */
  talents: Array<[string, string, string, string]>;
  criteria: Criteria;
  /** 取込ログ（新しい順）：[取込日時, ファイル名, 対象日, 行数, 結果] */
  log: Array<[string, string, string, number, string]>;
  spreadsheetUrl: string;
}

export interface UploadFile {
  name: string;
  text: string;
  start: string;
  end: string;
}

function describeUnexpected(status: number, finalUrl: string, text: string): string {
  const has = (...w: string[]) => w.some((x) => text.includes(x) || finalUrl.includes(x));
  let hint: string;
  if (has("doPost", "スクリプト関数が見つかりません", "Script function not found")) {
    hint = "デプロイされているのが古いコードです。Apps Script で「デプロイ → デプロイを管理 → 鉛筆 → バージョン：新バージョン → デプロイ」を行ってください";
  } else if (has("accounts.google.com", "ServiceLogin")) {
    hint = "Google へのログインを求められています。デプロイの「アクセスできるユーザー」を「全員」にして、新しいバージョンでデプロイし直してください";
  } else if (status === 404) {
    hint = "URLが見つかりません。デプロイ管理画面の「ウェブアプリ」のURL（/exec で終わるもの）を設定してください";
  } else {
    hint = "GAS_WEBAPP_URL がウェブアプリのURL（/exec で終わるもの）か、デプロイの「アクセスできるユーザー」が「全員」か確認してください";
  }
  return `スプレッドシートから想定外の応答がありました（${status}）。${hint}`;
}

export async function callGas<T>(config: GasConfig, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token: config.token, action, ...payload }),
    redirect: "follow",
    cache: "no-store",
  });
  const text = await res.text();
  let data: { ok?: boolean; error?: string } & T;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(describeUnexpected(res.status, res.url, text));
  }
  if (!data.ok) {
    throw new Error(
      data.error === "unauthorized"
        ? "合言葉（GAS_TOKEN）がスクリプトの TOKEN と一致しません"
        : `スプレッドシートのエラー：${data.error}`
    );
  }
  return data;
}
