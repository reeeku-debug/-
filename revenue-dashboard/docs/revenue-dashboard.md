# 配信収益ダッシュボード（IRIAM・Avvy・Mirrativ）

このアプリ（`revenue-dashboard/`）で、3媒体の登録者数・配信収益・KPI・要確認タレントを
「全体 → アプリ → タレント → KPI」の順に掘り下げて確認できます。

## 画面構成（タブ）

| タブ | URL | 内容 |
|---|---|---|
| TOP / 全体 | `/` | 全体KPIカード、アプリ別サマリー、売上構成、要確認、KPI状況、月別売上推移、登録者推移、1人あたり収益、不足項目、売上依存度、ランキング |
| IRIAM / Avvy / Mirrativ | `/app/[app]` | アプリ別KPI・要確認・月別推移・タレントランキング（並び替え可）・売上依存度 |
| タレント分析 | `/talents` | 全媒体横断のタレント一覧（アプリ・活動状況・要確認で絞り込み） |
| タレント詳細 | `/talents/[app]/[id]` | 基本情報・売上情報・配信情報・個人KPI（個別目標の設定）・月別/日別データ |
| KPI管理 | `/kpi` | KPI達成状況・不足分・月別の目標値設定 |
| データ取込・更新 | `/import` | CSVアップロード（プレビュー可）・取込状況 |
| 設定 | `/settings` | 接続状況・シート自動作成・カラムマッピング確認・アラートしきい値 |

期間は「当月 / 前月 / 今月累計 / 月を指定 / 任意期間」から選べます（URLの `?p=` で共有可能）。
進行中の月は **前月の同じ日数** と比較し、KPIには **月末着地見込み** と **残り日数で必要な1日あたりの実績** を表示します。
CSVは前日分までを毎日取り込む想定のため、経過日数には今日を含めません。

## 設計：データと画面の分離

```
RAW DATA（各アプリCSVそのまま / スプレッドシート）   src/lib/revenue/datasource/*
  ↓ NORMALIZE / TRANSFORM（カラムマッピング）        src/lib/revenue/mapping.ts, normalize.ts
共通フォーマット RevenueRecord / Talent / KpiTarget   src/lib/revenue/types.ts
  ↓ ANALYTICS                                        src/lib/revenue/analytics.ts, kpi.ts, alerts.ts, dashboard.ts
DASHBOARD                                            src/app/(dashboard)/*
```

CSVの形式が変わっても、`mapping.ts`（または MAPPING シート）だけで吸収でき、集計・画面は修正不要です。

### 媒体の追加（YouTube / REALITY / 17LIVE など）

1. `src/lib/revenue/apps.ts` の `APPS` に1件追加（ID・表示名・RAWシート名・色）
2. `src/lib/revenue/mapping.ts` の `DEFAULT_MAPPINGS` にカラム候補を追加（省略時は共通候補を使用）

タブ・サマリー表・グラフ・KPI設定・CSV取込は自動で対象になります。

### KPI項目の追加

`src/lib/revenue/kpi-definitions.ts` に定義を追加し、`analytics.ts` の `metricsToActuals` で実績値を返します。
定義にない項目名もKPIシートには登録でき、画面では「目標のみ（実績未対応）」として扱われます。

## スプレッドシートの構成

| シート | 必須 | 列 |
|---|---|---|
| `IRIAM_RAW` / `AVVY_RAW` / `MIRRATIV_RAW` | ○ | CSVの列そのまま + `_import_id` / `_imported_at`（取込時に自動付与） |
| `TALENTS` | ○ | `talent_id` / `タレント名` / `アプリ` / `登録日` / `活動開始日` / `ステータス` |
| `KPI` | ○ | `年月` / `アプリ` / `KPI項目` / `目標値` / `タレントID`（任意） |
| `MAPPING` | 任意 | `アプリ` / `項目` / `値`（カラムマッピングの上書き） |
| `SETTINGS` | 任意 | `項目` / `値`（アラートしきい値。設定画面から保存可） |

- ステータス：登録前・登録済・配信準備中・配信開始・休止・卒業（「登録前」は登録者数に含めない）
- `TALENTS` の `talent_id` は、各アプリCSVのタレントID（ライバーID等）と同じ値にします
- `KPI` の `アプリ` に `全体` を指定すると全媒体の目標。全体が未設定の項目はアプリ別目標の合計を使います
- KPI項目：売上 / 新規登録 / 活動開始 / 配信者数 / 売上発生人数 / タレント売上
  （タレント売上はそのアプリの各タレントの月間売上目標。`タレントID` を入れると個別目標）
- 設定画面の「不足しているシートを作成」でヘッダー付きのシートを自動作成できます

## Googleスプレッドシート連携の設定

1. Google Cloud でプロジェクトを作成し **Google Sheets API** を有効化
2. サービスアカウントを作成し、JSONキーを発行
3. スプレッドシートの共有で、サービスアカウントのメールアドレスを **編集者** として追加
4. 環境変数を設定（Vercel の Environment Variables など。ソースコードには書かない）

| 変数 | 内容 |
|---|---|
| `GOOGLE_SHEETS_SPREADSHEET_ID` | スプレッドシートID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | サービスアカウント（または `GOOGLE_SERVICE_ACCOUNT_JSON`） |
| `REVENUE_DATA_SOURCE` | `sheets` / `demo`（未指定なら接続情報の有無で自動判定） |
| `REVENUE_CACHE_TTL_SECONDS` | 読み込み結果のキャッシュ秒数（既定60。画面の「データを再読込」で即時更新） |

接続情報が無い場合は **ダミーデータ（デモモード）** で表示されます。デモモードでの取込・KPI保存は
サーバーのメモリ上のみで、再起動するとリセットされます。

## CSV取込と重複対策

- 取込方法は2通り
  - 画面：「データ取込・更新」でアプリを選んでCSVをアップロード（UTF-8 / Shift_JIS 自動判定、プレビュー可）
  - 自動：Google ドライブのフォルダに置いたCSVを Apps Script で取込（`scripts/gas/import-csv.gs`）
- 重複判定キー：`アプリ + 日付 + タレントID`（MAPPING で `record_id` を指定した場合はそれも含む）
- 同じキーのデータが複数回取り込まれた場合は **最も新しい取込のデータだけ** を集計に使います
  → 同じCSVを何度取り込んでも二重計上されず、修正版のCSVを取り込めば上書きされます
- 1回の取込の中で同じキーの行が複数ある場合（1日に複数配信の行があるCSV）は合算します
- 画面からの取込では、既存と同じ内容のデータはシートに追記しません（スキップ件数を表示）

### 実際のCSVを受け取ったら

1. 設定画面の「カラムマッピング」で、各項目がどの列に対応しているか確認
2. 認識されていない場合は MAPPING シートに行を追加（再デプロイ不要）

```
アプリ    項目                  値
IRIAM     revenue               獲得報酬(円)
IRIAM     talent_id             ライバーID,配信者ID     ← カンマ区切りで複数候補
Avvy      revenue_multiplier    0.8                     ← ポイント→円換算など
Mirrativ  stream_duration_unit  seconds                 ← minutes / hours / seconds（h:mm:ss は自動判定）
Mirrativ  record_id             配信ID                  ← 1日に複数行ある場合
```

指定できる項目：`date` `talent_id` `talent_name` `revenue` `record_id` `stream_minutes` `stream_count`
`revenue_multiplier` `stream_duration_unit`

※ 現在のデフォルトのカラム候補（`報酬額(円)` `earnings` `収益(円)` など）はダミーデータ用に仮定したものです。
CSVの列名が途中で変わった場合も、新旧どちらの列名も候補にあれば両方から値を拾います。

## 要確認（アラート）の判定

| 判定 | 既定値 |
|---|---|
| KPI達成率（進行中の月は着地見込み）が○%未満 → 要対応 | 50% |
| 前月比で売上が○%以上減少 | 30% |
| 前月比で新規登録が○%以上減少 | 20% |
| 登録後○日経過しているが売上0円 | 7日 |
| 登録済みだが期間内に配信していない | （登録後○日経過が条件） |
| ○日以上配信しているが1配信日あたり売上が○円未満 | 5日 / 1,000円 |
| 売上が上位1人に○%以上 / 上位3人に○%以上集中 | 40% / 70% |

しきい値は設定画面から変更できます（SETTINGS シートに保存）。

## 通知（Slack）

`GET /api/alerts` が要確認事項をJSONで返します（`Authorization: Bearer <REVENUE_CRON_SECRET>`）。
`?notify=1` を付けると `SLACK_WEBHOOK_URL` に通知します。Vercel Cron で毎朝実行する例（`vercel.json`）：

```json
{ "crons": [{ "path": "/api/alerts?notify=1", "schedule": "0 1 * * *" }] }
```

（Vercel Cron は `CRON_SECRET` 環境変数を Bearer トークンとして送るため、`CRON_SECRET` を設定すれば動作します）

## テスト

```bash
npm test
```

CSVパース・日付/数値変換・カラムマッピング・重複排除・KPI計算・アラート・CSV取込・Sheets API 呼び出し（モック）をテストしています。
