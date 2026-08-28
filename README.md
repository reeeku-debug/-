# REALITY新規登録者管理ダッシュボード

REALITYで新規登録した人の情報を漏れなく回収し、新規登録者数をリアルタイムに
把握・管理するための簡易ダッシュボードです。

## 技術スタック

- Next.js 14 (App Router) + TypeScript
- Prisma + SQLite(開発用。本番はPostgreSQLへの切り替えを推奨)
- Tailwind CSS
- 管理画面は共有パスワード + 署名付きCookieによる簡易認証

## セットアップ

```bash
npm install
cp .env.example .env   # ADMIN_PASSWORD 等を書き換える
npx prisma migrate dev --name init
npm run dev
```

http://localhost:3000 を開くと新規登録フォームが表示されます。
管理画面は http://localhost:3000/admin (`.env` の `ADMIN_PASSWORD` でログイン)。

## 画面構成

### 公開ページ(認証不要)

- `/register` — 新規登録フォーム(提出内容・REALITY URL・REALITY ID・活動名・本名を入力)
  - 登録日時は自動取得、REALITY IDの重複は登録時にサーバー側で検知
  - 登録後は成功メッセージを表示し、フォームを自動リセット
  - **本名などの一覧・詳細情報はこのページには一切表示されません**(書き込み専用)

### 管理画面(パスワード認証必須・`/admin/*`)

- `/admin` — ダッシュボード(累計/今日/今月の登録者数、最新登録者一覧)
- `/admin/registrants` — 登録者一覧(活動名・REALITY ID・本名・提出者でリアルタイム検索、編集・削除)
- `/admin/registrants/[id]/edit` — 登録情報の編集
- `/admin/export` — CSVダウンロード(登録日時・提出者・REALITY URL・REALITY ID・活動名・本名)
- `/admin/settings` — パスワード変更方法の案内・ログアウト

`middleware.ts` が `/admin/*` へのアクセスをすべてチェックし、未ログインの場合は
`/admin/login` にリダイレクトします。これにより本名などの個人情報は管理者以外に
表示されません。

## データ設計・重複防止・排他制御

- `prisma/schema.prisma` の `Registrant` モデルで `realityId` に一意制約を設定。
  DBレベルでの一意制約により、複数人が同時に登録操作をしても重複登録が起きません
  (アプリ側の事前チェック + DB制約の二重チェック)。
- Google Sheets APIなどのスプレッドシート運用は手軽な反面、同時書き込み時の
  競合や重複防止の実装が複雑になりやすいため、本実装では実データベース
  (Prisma + SQLite/PostgreSQL)を採用しています。SupabaseやNeonなどの
  マネージドPostgreSQLへそのまま接続できる構成です。

## 本番環境(PostgreSQL/Supabase等)への切り替え

1. Supabase等でPostgreSQLインスタンスを作成し、接続文字列を取得
2. `prisma/schema.prisma` の `datasource db` の `provider` を `"postgresql"` に変更
3. `.env` (または本番環境の環境変数) の `DATABASE_URL` を接続文字列に変更
4. `npx prisma migrate deploy` でマイグレーションを適用

ローカル開発では SQLite (`prisma/dev.db` ファイル) を使うため、追加のセットアップ
なしにブラウザを閉じてもデータが消えない状態で動作確認できます。

## 環境変数

`.env.example` を参照してください。

- `DATABASE_URL` — DB接続文字列
- `ADMIN_PASSWORD` — 管理画面ログインパスワード
- `ADMIN_SESSION_SECRET` — 管理セッションCookie署名用のランダムな文字列

## 既知の制限・今後の拡張候補

- 管理者アカウントは共有パスワード1つのみです(個別アカウント・権限分離は未実装)。
- 依存パッケージには既知の脆弱性が一部残っています。Next.js 14系の最新パッチ
  (14.2.35)を使用済みですが、完全な解消にはNext.js 15/16系への移行が必要です。
  本アプリはnext/imageの高度な機能・i18nミドルウェア・カスタムサーバーを
  使用していないため、実運用上の影響は限定的と判断しています。
