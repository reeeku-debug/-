# 配信収益ダッシュボード（IRIAM・Avvy・Mirrativ）

IRIAM・Avvy・Mirrativ の登録者数・配信収益・KPI・要確認タレントを横断して確認する管理画面です。
Googleスプレッドシート（各アプリのCSVを保存）をデータソースにし、データベースは使いません。
スプレッドシートを接続するまではダミーデータで動作します。

リポジトリ直下のタレント情報マッチングアプリとは **別のアプリ** です（このフォルダだけで完結しています）。

## 技術スタック

- Next.js 14（App Router）+ TypeScript + Tailwind CSS
- Google Sheets API（サービスアカウント認証）
- ログイン：パスワード1つ（環境変数）＋署名付きCookie

## ローカルで動かす

```bash
cd revenue-dashboard
npm install
cp .env.example .env   # DASHBOARD_PASSWORD などを設定
npm run dev            # http://localhost:3000
npm test               # ユニットテスト
```

## Vercel へのデプロイ（別プロジェクトとして作成）

1. https://vercel.com/new で GitHub リポジトリ `reeeku-debug/-` を選ぶ
2. **Root Directory** に `revenue-dashboard` を指定する（ここが重要）
3. Framework Preset は Next.js のまま
4. Environment Variables に以下を設定して Deploy

| 変数 | 必須 | 内容 |
|---|---|---|
| `DASHBOARD_PASSWORD` | ○ | ログインパスワード |
| `DASHBOARD_SESSION_SECRET` | ○ | ランダムな長い文字列（`openssl rand -base64 32` など） |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | 接続時 | スプレッドシートID |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 接続時 | サービスアカウントのJSONキー |
| `DASHBOARD_URL` | 任意 | 公開URL（Slack通知のリンク用） |
| `REVENUE_CRON_SECRET` / `SLACK_WEBHOOK_URL` | 任意 | アラート通知 |

スプレッドシート連携・CSV取込・KPI・アラートの詳細は [docs/revenue-dashboard.md](./docs/revenue-dashboard.md) を参照してください。
