"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { decodeCsv, parseRealityCsv, periodFromName, periodOfMonth } from "@/lib/reality/csv";
import { importFiles, invalidateRealityCache, writeReality } from "@/lib/reality/data";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function done() {
  invalidateRealityCache();
  revalidatePath("/", "layout");
}

export async function refreshAction() {
  await requireSession();
  done();
}

export interface ImportFileResult {
  name: string;
  ok: boolean;
  message: string;
}
export type ImportState = { results: ImportFileResult[]; error: string | null };

/** CSV（複数可）をチェックしてからスプレッドシートに取り込む */
export async function importAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireSession();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { results: [], error: "CSVファイルを選んでください" };
  const monthOverride = String(formData.get("month") ?? "").replace("-", "");

  const results: ImportFileResult[] = [];
  const upload: Array<{ name: string; text: string; start: string; end: string }> = [];
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      results.push({ name: file.name, ok: false, message: "ファイルが大きすぎます（5MBまで）" });
      continue;
    }
    try {
      const text = decodeCsv(await file.arrayBuffer());
      const records = parseRealityCsv(text);
      if (!records.length) throw new Error("データ行がありません");
      let period = periodFromName(file.name);
      if (monthOverride && /^\d{6}$/.test(monthOverride) && (!period || period.month !== Number(monthOverride))) {
        period = periodOfMonth(Number(monthOverride));
      }
      if (!period) throw new Error("ファイル名から期間を読み取れません。「対象月」を選んで取り込んでください");
      if (period.start.slice(0, 7) !== period.end.slice(0, 7)) throw new Error("期間が月をまたいでいます。月初からの累計CSVを入れてください");
      upload.push({ name: file.name, text, start: period.start, end: period.end });
    } catch (e) {
      results.push({ name: file.name, ok: false, message: (e as Error).message });
    }
  }
  if (!upload.length) return { results, error: null };

  try {
    const { messages } = await importFiles(upload);
    // スプレッドシートからは「ファイル名：結果」の形で返る
    for (const m of messages) {
      const i = m.indexOf("：");
      const name = i >= 0 ? m.slice(0, i) : "";
      const message = i >= 0 ? m.slice(i + 1) : m;
      results.push({ name, ok: message.startsWith("OK"), message });
    }
    done();
    return { results, error: null };
  } catch (e) {
    return { results, error: `取り込みに失敗しました：${(e as Error).message}` };
  }
}

export type SaveState = { ok: boolean; message: string | null };

export async function saveTalentAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireSession();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, message: "IDがありません" };
  try {
    await writeReality("saveTalent", {
      id,
      owner: String(formData.get("owner") ?? "").trim(),
      memo: String(formData.get("memo") ?? ""),
    });
    done();
    return { ok: true, message: "保存しました" };
  } catch (e) {
    return { ok: false, message: `保存できませんでした：${(e as Error).message}` };
  }
}

export async function saveCriteriaAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireSession();
  const n = (k: string) => Number(String(formData.get(k) ?? "").replace(/,/g, ""));
  const criteria = {
    hours: n("hours"),
    events: n("events"),
    t1: n("t1"),
    t2: n("t2"),
    t3: n("t3"),
    rate: n("rate") / 100,
    rescue: formData.get("rescue") === "on",
  };
  if (Object.values(criteria).some((v) => typeof v === "number" && (!Number.isFinite(v) || v < 0))) {
    return { ok: false, message: "数値を正しく入力してください" };
  }
  try {
    await writeReality("saveCriteria", { criteria });
    done();
    return { ok: true, message: "保存しました。スプレッドシートの設定シートにも反映されています" };
  } catch (e) {
    return { ok: false, message: `保存できませんでした：${(e as Error).message}` };
  }
}
