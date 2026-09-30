import { APPS } from "@/lib/revenue/apps";
import { KPI_HEADERS, MAPPING_HEADERS, SETTINGS_HEADERS, SHEET_NAMES, TALENTS_HEADERS } from "@/lib/revenue/datasource/types";
import { formatDateTimeJst } from "@/lib/revenue/format";
import { KPI_DEFINITIONS } from "@/lib/revenue/kpi-definitions";
import { SETTING_LABELS } from "@/lib/revenue/normalize";
import { getRevenueDataSource, loadRevenueData } from "@/lib/revenue/service";
import { DEFAULT_SETTINGS, TALENT_STATUSES, type RevenueSettings } from "@/lib/revenue/types";
import { InitSheetsForm, ThresholdForm } from "@/components/revenue/settings-forms";
import { Section } from "@/components/revenue/ui";

const UNITS: Record<keyof RevenueSettings, string> = {
  kpiLowRate: "%",
  revenueDropRate: "%",
  registrationDropRate: "%",
  noRevenueDays: "日",
  lowRevenueMinStreamDays: "日",
  lowRevenuePerDay: "円",
  concentrationTop1: "%",
  concentrationTop3: "%",
};

const ENV_VARS = [
  ["REVENUE_DATA_SOURCE", "sheets / demo（未指定なら接続情報の有無で自動判定）"],
  ["GOOGLE_SHEETS_SPREADSHEET_ID", "スプレッドシートID（URLの /d/ と /edit の間）"],
  ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "サービスアカウントのメールアドレス"],
  ["GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", "サービスアカウントの秘密鍵（\\n 区切りのままでOK）"],
  ["GOOGLE_SERVICE_ACCOUNT_JSON", "（代替）JSONキーをそのまま、またはBase64で"],
  ["REVENUE_CACHE_TTL_SECONDS", "スプレッドシート読み込み結果のキャッシュ秒数（既定60）"],
];

export default async function RevenueSettingsPage() {
  const data = await loadRevenueData();
  const { model, raw } = data;
  const { configError } = getRevenueDataSource();
  const envSet = (k: string) => !!process.env[k]?.trim();

  return (
    <div className="space-y-6">
      <Section title="データソース" description="Googleスプレッドシートとの接続状況">
        <dl className="grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <dt className="text-xs text-gray-500">現在のデータソース</dt>
            <dd className="font-semibold">{data.source.label}</dd>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <dt className="text-xs text-gray-500">読み込み日時</dt>
            <dd className="font-semibold">{formatDateTimeJst(data.loadedAt)}</dd>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <dt className="text-xs text-gray-500">不足しているシート</dt>
            <dd className="font-semibold">{raw.missingSheets.length > 0 ? raw.missingSheets.join("、") : "なし"}</dd>
          </div>
        </dl>
        {(configError || data.error) && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{configError ?? data.error}</p>
        )}
        <div className="mt-4">
          <InitSheetsForm enabled={data.source.kind === "sheets"} />
          {data.source.kind === "demo" && (
            <p className="mt-2 text-xs text-gray-500">スプレッドシート接続後に、必要なシート（ヘッダー行付き）を自動作成できます。</p>
          )}
        </div>
        <h3 className="mt-6 text-sm font-semibold">環境変数（認証情報はソースコードに書かず、Vercel等の環境変数で設定）</h3>
        <table className="mt-2 w-full text-sm">
          <tbody className="divide-y">
            {ENV_VARS.map(([k, desc]) => (
              <tr key={k}>
                <td className="py-1.5 pr-3 font-mono text-xs">{k}</td>
                <td className="py-1.5 pr-3 text-gray-600">{desc}</td>
                <td className="py-1.5 text-right text-xs">
                  {envSet(k) ? <span className="text-emerald-700">✓ 設定済</span> : <span className="text-gray-400">未設定</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-500">
          スプレッドシートの共有設定で、サービスアカウントのメールアドレスに「編集者」権限を付与してください。詳しい手順は docs/revenue-dashboard.md を参照。
        </p>
      </Section>

      <Section
        title="カラムマッピング"
        description="各アプリのCSVの列 → 共通フォーマットの対応。実際のCSVと列名が違う場合は MAPPING シートに行を追加すると再デプロイなしで変更できます。"
      >
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {model.mappingReports.map((r) => {
            const app = APPS.find((a) => a.id === r.app)!;
            return (
              <div key={r.app} className="rounded-lg border border-gray-200 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="inline-flex items-center gap-2 font-semibold">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: app.color }} />
                    {app.label}
                  </h3>
                  <span className="text-xs text-gray-500">{r.sheet}</span>
                </div>
                <table className="w-full text-xs">
                  <tbody className="divide-y">
                    {r.fields.map((f) => (
                      <tr key={f.field}>
                        <td className="py-1.5 pr-2 align-top text-gray-600">
                          {f.label}
                          {f.required && <span className="text-red-500"> *</span>}
                          <div className="font-mono text-[10px] text-gray-400">{f.field}</div>
                        </td>
                        <td className="py-1.5 align-top">
                          {f.matchedColumn ? (
                            <span className="font-medium text-emerald-700">✓ {f.matchedColumn}</span>
                          ) : (
                            <span className={f.required ? "font-medium text-red-600" : "text-gray-400"}>
                              {r.headers.length === 0 ? "（データなし）" : "該当列なし"}
                            </span>
                          )}
                          <div className="mt-0.5 text-[10px] text-gray-400" title={f.candidates.join(", ")}>
                            候補：{f.candidates.slice(0, 4).join(", ")}
                            {f.candidates.length > 4 && " …"}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-gray-500">
                  収益の換算係数 ×{r.revenueMultiplier}／配信時間の単位 {r.streamDurationUnit}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {r.rowCount.toLocaleString("ja-JP")}行 → 集計対象 {r.validRecords.toLocaleString("ja-JP")}件
                  （重複 {r.duplicateRows}・読取不可 {r.skippedRows}）
                </p>
                {r.errors.map((e) => (
                  <p key={e} className="mt-1 text-xs text-red-600">{e}</p>
                ))}
                {r.sampleErrors.length > 0 && (
                  <details className="mt-1 text-xs text-amber-800">
                    <summary className="cursor-pointer">読み取れなかった行の例</summary>
                    <ul className="list-disc pl-4">{r.sampleErrors.map((e) => <li key={e}>{e}</li>)}</ul>
                  </details>
                )}
                {r.headers.length > 0 && <p className="mt-2 break-all text-[10px] text-gray-400">シートの列：{r.headers.join(" / ")}</p>}
              </div>
            );
          })}
        </div>
        <div className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
          <p className="font-semibold text-gray-700">MAPPING シートの書き方（{MAPPING_HEADERS.join(" / ")}）</p>
          <pre className="mt-1 overflow-x-auto">{`IRIAM    revenue               獲得報酬(円)
IRIAM    talent_id             ライバーID,配信者ID     ← カンマ区切りで複数候補
Avvy     revenue_multiplier    0.8                     ← ポイント→円換算など
Mirrativ stream_duration_unit  seconds                 ← minutes / hours / seconds
Mirrativ record_id             配信ID                  ← 1日に複数行ある場合の重複判定用`}</pre>
        </div>
      </Section>

      <Section title="アラート設定" description="「要確認」を判定するしきい値（SETTINGS シートに保存）">
        <ThresholdForm
          writable={data.source.writable}
          fields={(Object.keys(DEFAULT_SETTINGS) as Array<keyof RevenueSettings>).map((k) => ({
            key: k,
            label: SETTING_LABELS[k],
            value: model.settings[k],
            unit: UNITS[k],
          }))}
        />
      </Section>

      <Section title="スプレッドシートの構成">
        <table className="w-full text-sm">
          <tbody className="divide-y">
            {APPS.map((a) => (
              <tr key={a.id}>
                <td className="py-2 pr-4 font-mono text-xs">{a.rawSheet}</td>
                <td className="py-2 text-gray-600">{a.label}のCSVをそのまま保存（列はCSVのまま + _import_id / _imported_at）</td>
              </tr>
            ))}
            <tr>
              <td className="py-2 pr-4 font-mono text-xs">{SHEET_NAMES.talents}</td>
              <td className="py-2 text-gray-600">
                {TALENTS_HEADERS.join(" / ")}（ステータス：{TALENT_STATUSES.join("・")}）
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono text-xs">{SHEET_NAMES.kpi}</td>
              <td className="py-2 text-gray-600">
                {KPI_HEADERS.join(" / ")}（KPI項目：{KPI_DEFINITIONS.map((d) => d.label).join("・")}。それ以外の項目名も登録可能）
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono text-xs">{SHEET_NAMES.mapping}</td>
              <td className="py-2 text-gray-600">任意。カラムマッピングの上書き（{MAPPING_HEADERS.join(" / ")}）</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-mono text-xs">{SHEET_NAMES.settings}</td>
              <td className="py-2 text-gray-600">任意。アラートのしきい値（{SETTINGS_HEADERS.join(" / ")}）</td>
            </tr>
          </tbody>
        </table>
      </Section>
    </div>
  );
}
