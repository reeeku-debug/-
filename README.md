# タレント情報マッチングシステム

タレント・所属者のプロフィール／実績／趣味／特技／目標を収集・蓄積し、管理者が
案件情報を入力すると登録者の中から適した人をAI（ルールベースのスコアリング）で
自動リストアップする、情報収集・案件マッチングアプリです。

## 技術スタック

- Next.js 14 (App Router) + TypeScript
- Prisma + PostgreSQL
- NextAuth.js（Credentials Provider、JWTセッション、回答者/管理者の2ロール）
- Tailwind CSS

## セットアップ

PostgreSQLが必要です（ローカルにインストール済み、またはDocker、あるいは
Neon/Supabase等の無料枠でも構いません）。

```bash
npm install
cp .env.example .env   # DATABASE_URL 等を自分のPostgreSQL接続情報に書き換える
npx prisma migrate dev --name init
npm run seed            # 管理者アカウント + サンプル回答者4名 + サンプル案件1件を投入
npm run dev
```

http://localhost:3000 を開いてください。

本番環境（Vercel等）へのデプロイ手順は [DEPLOY.md](./DEPLOY.md) を参照してください。

### シードで作成されるアカウント

- 管理者：`.env` の `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`（デフォルト
  `admin@example.com` / `ChangeMe123!`） → `/admin/login` からログイン
- サンプル回答者：`mirune@example.com` などパスワードは全員 `password123`
  → `/login` からログイン

## 画面構成

### 回答者側（スマホファースト）

- `/register`, `/login` — 新規登録・ログイン
- `/form` — STEP1〜8のステップ形式プロフィール入力フォーム（進捗率表示、
  「次へ」を押すたびにDBへ一時保存、加えてブラウザのlocalStorageにも自動保存）
- `/mypage` — 自分の登録内容の確認・編集導線、情報更新が必要な場合の案内

### 管理者側（PC想定・左サイドバー構成）

- `/admin` — ダッシュボード（登録者数、今月の新規登録者数、情報更新が必要な人数、
  案件数、案件候補者数、最近登録/更新された人）
- `/admin/talents` — 登録者一覧（本名は非表示）＋キーワード検索
- `/admin/talents/[id]` — 登録者詳細（本名を含む全項目、管理者メモ編集）
- `/admin/talents/[id]/edit` — 管理者による登録情報の編集
- `/admin/search` — 実績・趣味・特技・やりたい仕事・SNS種類・フォロワー数・
  半年後の目標・最終的な夢を組み合わせた複数条件検索
- `/admin/projects` — 案件管理（一覧・新規登録・編集・ステータス変更）
- `/admin/projects/[id]` — 案件詳細＋「候補者を探す」でマッチング実行、
  ランキング結果と候補者管理（候補者に追加／お気に入り／除外／メモ）
- `/admin/matching` — 案件マッチングのエントリーページ（案件を選んでマッチング）

## マッチングエンジンについて

`src/lib/matching.ts` に実装。外部LLM APIには依存せず、案件の必須条件・
本人の希望案件・実績・趣味・特技・活動ジャンル（SNS利用状況）・SNS規模・
半年後の目標・最終的な夢との親和性を重み付けし、0〜100点のマッチ度と
日本語のおすすめ理由（箇条書き＋要約文）を生成するルールベースのスコアリング
エンジンです。入出力をシンプルなデータ構造に保っているため、将来的に外部AI
（LLM）による推薦スコアへの差し替え・併用がしやすい設計になっています。

## データ構造

`prisma/schema.prisma` を参照。仕様書の想定に合わせて `users` /
`achievements` / `profiles`（`hobbies`・`skills`・`desiredWorks`は正規化して
別テーブル化） / `social_accounts` / `projects` / `project_candidates` に
相当するテーブルを定義しています。

## 既知の制限・今後の拡張候補

- SNS情報・フォロワー数は現状すべて手入力です（自動取得は未実装）。
- マッチングはルールベースのスコアリングであり、外部LLMによる高度な推薦への
  差し替えは将来対応です。
- CSV出力、Slack/Discord/LINE通知、Googleスプレッドシート連携などは未実装
  （仕様書「21. 将来的な拡張」に記載の項目）。
- 依存パッケージには既知の脆弱性が一部残っています（`npm audit` 参照）。
  重大なものは Next.js 14.2 系の最新パッチ（14.2.35）へのアップグレードで
  解消済みですが、Next.js 15/16 系への移行が必要な項目は本アプリの利用範囲
  （next/image・WebSocketアップグレード・i18nミドルウェア・カスタムサーバー
  を使用していない）では影響が限定的と判断し、対応を見送っています。
