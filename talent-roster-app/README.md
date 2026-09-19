# タレント情報管理アプリ（kintone移行）

アソビネクスト / ANNIN 所属タレントの基本情報・銀行口座・月次入金状況を、
管理者が手動で登録・管理するための単体アプリです。

他のアプリ（実績報告アプリ等）とはリポジトリ内で分離されたディレクトリに
配置されていますが、コードは独立しています。Vercelにデプロイする際は
**専用の新しいVercelプロジェクト・専用のデータベース**を使用してください
（他アプリとデータベースを共有すると、テーブル名の衝突などの問題が起こります）。

## 技術スタック

- Next.js 14 (App Router) + TypeScript
- Prisma + PostgreSQL
- NextAuth.js（Credentials Provider、JWTセッション、管理者のみの単一ロール）
- Tailwind CSS

## セットアップ

PostgreSQLが必要です（ローカルにインストール済み、またはDocker、あるいは
Neon/Supabase等の無料枠でも構いません）。

```bash
npm install
cp .env.example .env   # DATABASE_URL 等を自分のPostgreSQL接続情報に書き換える
npx prisma migrate dev --name init
npm run seed            # 管理者アカウント + 事務所マスタ + 入金月マスタを投入
npm run dev
```

http://localhost:3000 を開いてください。`/login` からログインします。

### シードで作成されるアカウント

- 管理者：`.env` の `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`（デフォルト
  `admin@example.com` / `ChangeMe123!`）

## 画面構成

- `/login` — ログイン
- `/talents` — タレント一覧（一覧・ページネーション・キーワード検索・
  所属事務所/性別/在籍状況/当月入金状況/登録年月/要確認での絞り込み）
- `/talents/new` — ＋タレントを登録（本名・読み方・性別・年齢・所属事務所・
  住所・銀行口座を入力。No.はサーバー側で自動採番）
- `/talents/[id]` — タレント詳細（基本情報・銀行情報・月次入金状況の確認）
- `/talents/[id]/edit` — 登録情報の編集（在籍状況：在籍/休止/退所を含む）

## kintone実データの反映・一括移行

実際のkintoneエクスポート（ANNIN/ネクストの2事務所分、氏名・年齢・性別・No.を
含む名簿シート）を確認した結果を踏まえた設計になっています。

- `Talent.age`（年齢） — 実データに存在する項目
- `Talent.legacyNo` / `@@unique([companyId, legacyNo])` — kintone側の事務所内
  通し番号（ANNIN NO. / NEXT NO.）を保持し、再インポート時の重複登録を防止。
  このアプリ自体の `talentNo` は事務所をまたいだ一つの連番。
- `Talent.needsReview` / `reviewNote` — 移行データの氏名文字化けや名の特定不能
  など、スタッフの確認が必要なレコードにフラグを立てる。一覧に「要確認」
  バッジ＋絞り込みを表示し、編集画面でチェックを外すと解除できる。
- `scripts/import-legacy-talents.ts` — kintoneエクスポート（シート名
  「ANNINタレント」「ネクストタレント」、列 `[No., 姓名, 年齢, 姓, 芸名（カナ）,
  性別]`）を読み込み、住所・銀行口座・入金情報は空欄のまま一括登録するスクリプト。
  `npm run import:legacy-talents -- <xlsxファイルパス>` で実行（要 `DATABASE_URL`）。

## 未実装（次フェーズ）

- 入金ステータスの編集UI（現在は確認のみ）
- ダッシュボード
- CSV出力
- Lステップ・Googleスプレッドシート連携
