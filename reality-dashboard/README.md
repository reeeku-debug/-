# REALITY ティア判定ダッシュボード

REALITY の配信レポートCSVを取り込むと、各月を評価月として T1〜T5 を自動判定し、月ごとに確認できる管理画面です。
IRIAM・Avvy・Mirrativ の収益ダッシュボード（`revenue-dashboard`）とは **別のアプリ** です。

- データは REALITY のスプレッドシート「REALITY_ティア判定_週次KPI」に保存します（DBは使いません）
- 画面からCSVを取り込むと、スプレッドシートの日次RAW・月次RAW・タレントマスタが更新され、ティア判定・週次KPIなどのシートもそのまま動きます
- 判定ルールはスプレッドシートの「ティア判定」シートと同じです（過去16ヶ月・4,645件で一致を確認済み）

## 画面

| 画面 | できること |
|---|---|
| ティア一覧 | 月タブで評価月を切り替え、T1〜T5・未評価のメンバー、人数と前月比、昇格・降格・新規を確認。名前・担当者・変化で絞り込み。名前を押すと判定理由・次の目標・月ごとのティア推移、担当者・メモの編集。この月をCSV書き出し |
| CSV取込 | REALITY の配信レポートCSV（複数可）を取り込む。取込ログの確認 |
| 判定基準・設定 | 60h・5回・50万/30万/10万・救済ON/OFF・還元率の変更（スプレッドシートの設定シートに保存）、接続状態の確認 |

## セットアップ

### 1. スプレッドシート側（Apps Script）

1. REALITY のスプレッドシートで「拡張機能 → Apps Script」を開き、`reality-tier/REALITY_日次取込.gs` の中身を貼り付ける
2. スクリプト先頭の `TOKEN` を推測されにくい長い英数字（合言葉）に書き換えて保存する
3. 「デプロイ → 新しいデプロイ」→ 種類「ウェブアプリ」、実行ユーザー「自分」、アクセスできるユーザー「全員」でデプロイし、権限を許可する
4. 表示された「ウェブアプリ URL」（…/exec）を控える

スクリプトを書き換えたときは「デプロイ → デプロイを管理 → 鉛筆 → バージョン：新バージョン → デプロイ」で更新します（URLは変わりません）。

### 2. Vercel（別プロジェクトとして作成）

1. https://vercel.com/new で GitHub リポジトリ `reeeku-debug/-` を選ぶ
2. **Root Directory** に `reality-dashboard` を指定する
3. Environment Variables を設定して Deploy

| 変数 | 内容 |
|---|---|
| `DASHBOARD_PASSWORD` | ログインパスワード |
| `DASHBOARD_SESSION_SECRET` | ランダムな長い文字列（`openssl rand -base64 32` など） |
| `GAS_WEBAPP_URL` | 手順1-4のウェブアプリURL |
| `GAS_TOKEN` | 手順1-2の合言葉 |

## ローカルで動かす

```bash
cd reality-dashboard
npm install
cp .env.example .env   # 値を設定
npm run dev            # http://localhost:3000
npm test
```
