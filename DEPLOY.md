# Vercelへのデプロイ手順

このアプリをVercelにデプロイして、公開URLを発行するための手順です。
（Prisma + PostgreSQL 構成にしてあるので、Vercelのようなサーバーレス環境でも動作します）

## 1. データベース（PostgreSQL）を用意する

Vercel上でPostgreSQLを使う一番簡単な方法は、Vercelのマーケットプレイス経由で
Neonなどを追加することです。

1. Vercelにログイン → 対象プロジェクト（まだ無ければ後述の手順3で作成）→
   **Storage** タブ → **Create Database** → **Postgres**（Neon等）を選択
2. 作成すると自動的に `DATABASE_URL` という環境変数がプロジェクトに追加されます
   （手動でコピペする必要はありません）

Neon/Supabaseを直接使う場合は、それぞれのダッシュボードで接続文字列
（`postgresql://...`）を取得してください。

## 2. リポジトリをVercelにインポートする

1. https://vercel.com/new を開く
2. GitHubと連携し、対象のリポジトリを選択
3. Framework Preset は自動で **Next.js** と検出されます
4. Build Command は自動検出のままでOKです
   （`package.json` の `vercel-build` スクリプトが自動的に使われ、
   `prisma generate && prisma migrate deploy && next build` が実行されます）

## 3. 環境変数を設定する

Vercelのプロジェクト設定 → **Environment Variables** で以下を追加してください。

| キー | 値 |
|---|---|
| `DATABASE_URL` | 手順1で用意したPostgreSQLの接続文字列（Vercel Postgres/Neon連携なら自動設定済み） |
| `DATABASE_URL_UNPOOLED` | マイグレーション用の直接接続文字列（Neon連携なら自動設定済み。なければ`DATABASE_URL`と同じ値でOK） |
| `NEXTAUTH_SECRET` | ランダムな文字列。ターミナルで `openssl rand -base64 32` などで生成 |
| `NEXTAUTH_URL` | デプロイ後に割り当てられるURL（例: `https://your-app.vercel.app`）。初回デプロイ後に確認して設定し、再デプロイしてください |
| `SEED_ADMIN_EMAIL` | マネージャーログイン用メールアドレス（任意の値） |
| `SEED_ADMIN_PASSWORD` | マネージャーログイン用パスワード（任意の値） |

## 4. デプロイ

「Deploy」を押すとビルドとマイグレーション（`prisma migrate deploy`）が自動実行されます。

初回デプロイ完了後、マネージャーアカウントと初期STEPデータを投入する必要があります。
ローカルの開発環境から、本番のDBに向けて一度だけ実行してください。

```bash
# .env の DATABASE_URL を本番のPostgreSQL接続文字列に一時的に書き換えてから
npm run seed
```

（サンプルタレントが不要な場合は、`prisma/seed.ts` のサンプルタレント登録部分を
削除してから実行するか、Vercelのダッシュボードや `psql` から直接
マネージャーユーザーとSTEPマスタのみを投入しても構いません。）

## 5. 動作確認

`https://your-app.vercel.app/admin/login` にアクセスし、マネージャーアカウントで
ログインできることを確認してください。

## 補足

- 無料枠のPostgres（Neon等）は接続数に制限があります。アクセスが増えてきたら
  コネクションプーリング対応（Prisma Accelerate や `pgbouncer` 設定）を検討してください。
- `NEXTAUTH_URL` を正しく設定しないとログインのリダイレクトが正しく動作しません。
  カスタムドメインを設定した場合は、そのドメインに更新して再デプロイしてください。
- 完了報告の証拠画像はローカルファイルシステム（`public/uploads/`）に保存される
  実装です。Vercel等のサーバーレス環境ではデプロイのたびにファイルが消えるため、
  本番運用では S3 等の外部ストレージへの差し替えを推奨します。
