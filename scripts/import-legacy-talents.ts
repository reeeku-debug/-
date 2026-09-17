// kintone移行用の一括登録スクリプト。
//
// 使い方:
//   npx tsx scripts/import-legacy-talents.ts <xlsxファイルパス>
//
// 想定する入力ファイル: シート「ANNINタレント」「ネクストタレント」を持つxlsx。
// 各シートの列: [No., 姓名, 年齢, 姓, 芸名（カナ）, 性別]
//
// - 事務所は「ANNINタレント」→ANNIN、「ネクストタレント」→アソビネクストに割り当てる
//   （事前に Company マスタが投入されていること。prisma/seed.ts 参照）。
// - タレントNo.（talentNo）はこのアプリ内で新規に連番採番する。元のkintone上の
//   No.（ANNIN NO. / NEXT NO.）は legacyNo として保持し、(companyId, legacyNo) の
//   一意制約により再実行しても重複登録されない。
// - 氏名に文字化け（U+FFFD等）が疑われる行は needsReview フラグを立てて登録し、
//   スタッフが編集画面で確認・修正できるようにする。
// - 住所・銀行口座・入金情報はこの時点では空欄のまま登録し、入金レコードは
//   既存の全PaymentMonthに対して「未入金」で作成する（手動登録と同じ挙動）。

import path from "node:path";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SHEET_COMPANY_MAP: Record<string, string> = {
  ANNINタレント: "ANNIN",
  ネクストタレント: "アソビネクスト",
};

const INSERT_CHUNK_SIZE = 2000;

interface ParsedRow {
  legacyNo: number;
  lastName: string;
  firstName: string;
  age: number | null;
  gender: string | null;
  needsReview: boolean;
  reviewNote: string | null;
}

function hasMojibake(...values: string[]): boolean {
  return values.some((v) => v.includes("�"));
}

function splitName(fullNameRaw: unknown, lastNameRaw: unknown): { lastName: string; firstName: string } {
  const full = String(fullNameRaw ?? "").trim();
  const last = String(lastNameRaw ?? "").trim();
  if (last && full.startsWith(last)) {
    const first = full.slice(last.length).trim();
    return { lastName: last, firstName: first };
  }
  const parts = full.split(/\s+/).filter(Boolean);
  return { lastName: parts[0] ?? full, firstName: parts.slice(1).join(" ") };
}

function parseAge(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") {
    return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  }
  const m = String(v).match(/-?\d+/);
  if (!m) return null;
  const n = Number.parseInt(m[0], 10);
  return n > 0 ? n : null;
}

function mapGender(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s === "男") return "男性";
  if (s === "女") return "女性";
  if (s === "ジェンダーレス") return "その他";
  return "その他";
}

function parseRow(cells: unknown[]): ParsedRow | null {
  const [noRaw, fullNameRaw, ageRaw, lastNameRaw, , genderRaw] = cells;
  if (noRaw == null) return null;
  const legacyNo = Math.round(Number(noRaw));
  if (!Number.isFinite(legacyNo)) return null;

  const { lastName, firstName } = splitName(fullNameRaw, lastNameRaw);
  const fullNameStr = String(fullNameRaw ?? "").trim();
  const lastNameStr = String(lastNameRaw ?? "").trim();

  let needsReview = false;
  const notes: string[] = [];

  if (hasMojibake(fullNameStr, lastNameStr)) {
    needsReview = true;
    notes.push(`氏名に文字化けの疑いがあります（元データ: 姓名="${fullNameStr}"）。正しい漢字に修正してください。`);
  }
  if (!firstName) {
    needsReview = true;
    notes.push(`名を特定できませんでした（元データ: 姓名="${fullNameStr}"）。名を確認して入力してください。`);
  }

  return {
    legacyNo,
    lastName: lastName || fullNameStr || "(不明)",
    firstName: firstName || "(不明)",
    age: parseAge(ageRaw),
    gender: mapGender(genderRaw),
    needsReview,
    reviewNote: notes.length > 0 ? notes.join(" ") : null,
  };
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("使い方: npx tsx scripts/import-legacy-talents.ts <xlsxファイルパス>");
    process.exit(1);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.resolve(filePath));

  const companies = await prisma.company.findMany();
  const companyIdByName = new Map(companies.map((c) => [c.name, c.id]));

  const months = await prisma.paymentMonth.findMany({ select: { id: true } });
  if (months.length === 0) {
    console.warn("PaymentMonthが未投入です。先に `npm run seed` を実行してください。");
  }

  let totalCreated = 0;
  let totalSkipped = 0;
  let totalReview = 0;

  for (const [sheetName, companyName] of Object.entries(SHEET_COMPANY_MAP)) {
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      console.warn(`シート「${sheetName}」が見つかりません。スキップします。`);
      continue;
    }
    const companyId = companyIdByName.get(companyName);
    if (!companyId) {
      console.warn(`事務所「${companyName}」がCompanyマスタに存在しません。先にseedを実行してください。`);
      continue;
    }

    const parsedRows: ParsedRow[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header
      const cells = row.values as unknown[];
      // ExcelJSのrow.valuesは1始まりで[0]が空なので、1オフセット分ずらす
      const parsed = parseRow(cells.slice(1));
      if (parsed) parsedRows.push(parsed);
    });

    console.log(`--- ${sheetName} (${companyName}) --- 読み込み行数: ${parsedRows.length}`);

    const existing = await prisma.rosterTalent.findMany({
      where: { companyId, legacyNo: { in: parsedRows.map((r) => r.legacyNo) } },
      select: { legacyNo: true },
    });
    const existingLegacyNos = new Set(existing.map((e) => e.legacyNo));

    const toInsert = parsedRows.filter((r) => !existingLegacyNos.has(r.legacyNo));
    totalSkipped += parsedRows.length - toInsert.length;

    if (toInsert.length === 0) {
      console.log("  すべて登録済みのためスキップしました。");
      continue;
    }

    const { _max } = await prisma.rosterTalent.aggregate({ _max: { talentNo: true } });
    let nextTalentNo = (_max.talentNo ?? 0) + 1;

    const talentRows = toInsert.map((r) => {
      const id = randomUUID();
      const talentNo = nextTalentNo++;
      if (r.needsReview) totalReview += 1;
      return {
        id,
        talentNo,
        legacyNo: r.legacyNo,
        lastName: r.lastName,
        firstName: r.firstName,
        age: r.age,
        gender: r.gender,
        companyId,
        needsReview: r.needsReview,
        reviewNote: r.reviewNote,
      };
    });

    for (let i = 0; i < talentRows.length; i += INSERT_CHUNK_SIZE) {
      const chunk = talentRows.slice(i, i + INSERT_CHUNK_SIZE);
      await prisma.rosterTalent.createMany({ data: chunk });
      await prisma.bankAccount.createMany({
        data: chunk.map((t) => ({ id: randomUUID(), talentId: t.id })),
      });

      if (months.length > 0) {
        const paymentRows = chunk.flatMap((t) =>
          months.map((m) => ({ id: randomUUID(), talentId: t.id, paymentMonthId: m.id }))
        );
        for (let j = 0; j < paymentRows.length; j += INSERT_CHUNK_SIZE) {
          await prisma.paymentRecord.createMany({ data: paymentRows.slice(j, j + INSERT_CHUNK_SIZE) });
        }
      }
      console.log(`  ${Math.min(i + INSERT_CHUNK_SIZE, talentRows.length)}/${talentRows.length} 件登録済み`);
    }

    totalCreated += talentRows.length;
  }

  console.log("\n=== 完了 ===");
  console.log(`新規登録: ${totalCreated}件 / 既存のためスキップ: ${totalSkipped}件 / 要確認フラグ: ${totalReview}件`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
