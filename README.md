# VTuber活動ロードマップ・スタンプラリー

VTuberタレント一人一人に専用のロードマップを発行し、活動開始（初配信）までの
進捗をスタンプラリー形式で管理するWebシステムです。タレントは自分専用ページで
STEPを確認して完了報告を送信し、管理者がその報告を承認することで進捗が確定・
次のSTEPが解放されます。**進捗を確定できるのは管理者のみ**です。

## 技術スタック

- Next.js 14 (App Router) + TypeScript
- Prisma + PostgreSQL
- NextAuth.js（Credentials Provider、JWTセッション、タレント/管理者の2ロール）
- Tailwind CSS

## セットアップ

PostgreSQLが必要です（ローカルにインストール済み、またはDocker、あるいは
Neon/Supabase等の無料枠でも構いません）。

```bash
npm install
cp .env.example .env   # DATABASE_URL 等を自分のPostgreSQL接続情報に書き換える
npx prisma migrate dev --name init
npm run seed            # 管理者アカウント + 初期10STEP+GOAL + サンプルタレント3名を投入
npm run dev
```

http://localhost:3000 を開いてください。

本番環境（Vercel等）へのデプロイ手順は [DEPLOY.md](./DEPLOY.md) を参照してください。

### シードで作成されるアカウント

- 管理者：`.env` の `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`（デフォルト
  `admin@example.com` / `ChangeMe123!`） → `/admin/login` からログイン
- サンプルタレント：`hoshino` / `kirakira` / `sorane`（パスワードは全員
  `password123`） → `/login` からログイン
  - `hoshino`: STEP1から挑戦開始の状態
  - `kirakira`: STEP1〜3が承認済み、STEP4が確認待ちの状態
  - `sorane`: 全STEP CLEAR・GOAL到達済みの状態

## 画面構成

### タレント側（スマホファースト）

- `/login` — タレントログイン（ログインID・パスワード）
- `/talent/[slug]` — 自分専用の活動ロードマップ（進捗率・スタンプ獲得数、
  STEPごとの状態表示、完了報告フォーム）。他のタレントのURLを知っていても、
  ログインセッションが自分自身のものでなければ必ず自分自身のページへ
  リダイレクトされ、他人の進捗は閲覧できません。

### 管理者側（PC想定・左サイドバー構成）

- `/admin/login` — 管理者ログイン
- `/admin` — ダッシュボード（タレント数・確認待ち件数・GOAL達成数、
  タレント別の進捗一覧）
- `/admin/talents` — タレント一覧・追加・編集・削除
- `/admin/talents/new` — タレント新規登録（ログインID・初期パスワード・
  専用URLを自動発行。パスワードは発行直後の画面にのみ表示）
- `/admin/talents/[id]` — タレント詳細（進捗サマリー、確認待ち完了報告の
  承認/差し戻し、STEPごとの直接操作：CLEARにする／未達成に戻す／
  ロックする／スキップする、パスワード再発行）
- `/admin/talents/[id]/edit` — タレント情報編集（活動名・初配信予定日・備考）
- `/admin/reports` — 全タレントの確認待ち完了報告の一覧・承認/差し戻し
- `/admin/steps` — STEPマスタ管理（STEP名・内容・アイコン・ボタン文言の
  編集、追加、削除、並び替え、有効/無効切替）

## 進捗の状態遷移

各STEPは以下の4状態を持ちます。

- 🔒 `LOCKED` — 前のSTEPが承認されるまで挑戦できない
- 🟡 `CHALLENGE` — 挑戦中。完了報告を送信できる
- 📨 `REVIEW` — 完了報告送信済み。管理者の確認待ち
- ✅ `CLEAR` — 管理者が承認済み。次のSTEPが解放される

タレント側から呼び出せるのは「完了報告の送信」（`CHALLENGE → REVIEW`）のみで、
`CLEAR`への遷移（進捗の確定）は管理者用の関数からしか行えない設計に
なっています（`src/lib/progress.ts` 参照）。承認・差し戻し・直接のSTEP操作・
STEPマスタの追加削除に伴う全タレントの再計算も、すべてこのモジュールに
集約しています。

## データ構造

`prisma/schema.prisma` を参照。`Admin` / `Talent` / `StepTemplate`
（STEPマスタ、管理者が自由に編集可能） / `TalentStepStatus`（タレント×STEP
ごとの現在状態） / `StepReport`（完了報告の履歴、証拠画像・関連URL・
承認/差し戻し履歴を保持）から構成されます。タレントごとの進捗データは
完全に分離されており、他タレントのデータへは参照時に必ず自分自身の
`talentId`（セッションから取得、クライアントからは受け取らない）でのみ
アクセスします。

## 証拠画像について

完了報告に添付された証拠画像は `public/uploads/` にローカル保存されます。
Vercel等のサーバーレス環境ではファイルシステムが永続化されないため、
本番運用では S3 等の外部ストレージへの差し替えを推奨します
（`src/lib/upload.ts` を参照）。

## 既知の制限・今後の拡張候補

- 証拠画像はローカルファイルシステム保存のみ（外部ストレージ未対応）。
- 通知機能（Slack/Discord/LINE等）は未実装。
- CSV出力など管理者向けのエクスポート機能は未実装。
