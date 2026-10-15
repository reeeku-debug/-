// REALITY のティア判定。スプレッドシート「ティア判定」シートの数式と同じルール。
// T1 → T2 → T3 → T4 → T5 の順に判定し、最初に当てはまったティアになる。

export const TIERS = ["T1", "T2", "T3", "T4", "T5", "未評価"] as const;
export type Tier = (typeof TIERS)[number];
export type Change = "昇格" | "降格" | "維持" | "新規" | "—" | "";

export interface Criteria {
  /** 基本条件：月の配信時間（h） */
  hours: number;
  /** 基本条件：月のイベント参加数 */
  events: number;
  /** T1：3ヶ月平均の月売上（円） */
  t1: number;
  /** T2：3ヶ月平均の月売上（円） */
  t2: number;
  /** T3：月売上（円） */
  t3: number;
  /** 既存タレントの救済（デビュー4ヶ月目以降でも直近3ヶ月に T3 の月売上があれば T3） */
  rescue: boolean;
  /** 会社への還元率（0〜1） */
  rate: number;
  /** 設定シートの評価月（使用中）。null なら確定している最新月 */
  evalMonth: number | null;
}

export const DEFAULT_CRITERIA: Criteria = {
  hours: 60,
  events: 5,
  t1: 500000,
  t2: 300000,
  t3: 100000,
  rescue: true,
  rate: 0.35,
  evalMonth: null,
};

/** 月次RAW の1行：[月キー, ID, 配信者名, ランク, 配信回数, 配信時間, 視聴者数, ギフト金額, スコア, イベント参加数, 初配信日] */
export type MonthlyRow = [number, string, string, string, number, number, number, number, number, number, string];

interface Stat {
  hours: number;
  events: number;
  gift: number;
}

export interface MonthlyIndex {
  months: number[];
  idsByMonth: Record<number, string[]>;
  stat: Record<string, Stat>;
  rank: Record<string, string>;
  debut: Record<string, number | null>;
  debutDate: Record<string, string>;
  latestName: Record<string, string>;
}

export interface Judgement {
  id: string;
  name: string;
  rank: string;
  debutDate: string;
  debutMonth: number | null;
  /** 評価月 − デビュー月（月数） */
  elapsed: number | null;
  hours: number;
  events: number;
  sales: number;
  sales1: number;
  sales2: number;
  avg3: number;
  basic: boolean;
  firstHours: number | null;
  firstEvents: number | null;
  debutMax: number | null;
  recentMax: number;
  tier: Tier;
  reason: string;
  next: string;
  company: number;
}

export const addMonths = (ym: number, k: number) => {
  const t = Math.floor(ym / 100) * 12 + (ym % 100) - 1 + k;
  return Math.floor(t / 12) * 100 + (t % 12) + 1;
};
export const monthDiff = (a: number, b: number) =>
  (Math.floor(a / 100) - Math.floor(b / 100)) * 12 + (a % 100) - (b % 100);
export const monthLabel = (ym: number) => `${Math.floor(ym / 100)}年${ym % 100}月`;
export const tierRank = (t: string) => {
  const i = (TIERS as readonly string[]).indexOf(t);
  return i < 0 ? 99 : i;
};

const yen = (n: number) => Math.round(n).toLocaleString("ja-JP");
const man = (n: number) => (n % 10000 === 0 ? `${n / 10000}万` : `${yen(n)}円`);

export function parseYmd(v: unknown): { y: number; m: number; d: number } | null {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{4})[/\-.年](\d{1,2})[/\-.月](\d{1,2})/) || s.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}

/** 月次RAW の行から判定用の索引を作る（初配信日は「そのIDの最初の行」の値を使う：シートの数式と同じ） */
export function buildIndex(rows: MonthlyRow[]): MonthlyIndex {
  const idx: MonthlyIndex = { months: [], idsByMonth: {}, stat: {}, rank: {}, debut: {}, debutDate: {}, latestName: {} };
  const latestMonth: Record<string, number> = {};
  const sorted = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r[0] - b.r[0] || a.i - b.i)
    .map((x) => x.r);
  for (const r of sorted) {
    const m = Number(r[0]);
    const id = String(r[1] ?? "").trim();
    if (!m || !id) continue;
    const key = `${m}|${id}`;
    const s = (idx.stat[key] ??= { hours: 0, events: 0, gift: 0 });
    s.hours += Number(r[5]) || 0;
    s.events += Number(r[9]) || 0;
    s.gift += Number(r[7]) || 0;
    if (!(key in idx.rank)) idx.rank[key] = String(r[3] ?? "");
    if (!(id in idx.debut)) {
      const p = parseYmd(r[10]);
      idx.debut[id] = p ? p.y * 100 + p.m : null;
      idx.debutDate[id] = p ? `${p.y}/${String(p.m).padStart(2, "0")}/${String(p.d).padStart(2, "0")}` : "";
    }
    if (!idx.idsByMonth[m]) {
      idx.idsByMonth[m] = [];
      idx.months.push(m);
    }
    if (!idx.idsByMonth[m].includes(id)) idx.idsByMonth[m].push(id);
    if (!(id in latestMonth) || m >= latestMonth[id]) {
      latestMonth[id] = m;
      idx.latestName[id] = String(r[2] ?? "");
    }
  }
  return idx;
}

const ZERO: Stat = { hours: 0, events: 0, gift: 0 };
const stat = (idx: MonthlyIndex, m: number, id: string) => idx.stat[`${m}|${id}`] ?? ZERO;

export function judge(idx: MonthlyIndex, id: string, ev: number, c: Criteria): Judgement {
  const F = idx.debut[id] ?? null;
  const G = F === null ? null : monthDiff(ev, F);
  const cur = stat(idx, ev, id);
  const J = cur.gift;
  const K = stat(idx, addMonths(ev, -1), id).gift;
  const L = stat(idx, addMonths(ev, -2), id).gift;
  const M = (J + K + L) / 3;
  const basic = cur.hours >= c.hours && cur.events >= c.events;
  const O = F === null ? null : stat(idx, F, id).hours;
  const P = F === null ? null : stat(idx, F, id).events;
  const Q =
    F === null
      ? null
      : Math.max(0, ...[0, 1, 2].map((k) => (addMonths(F, k) > ev ? 0 : stat(idx, addMonths(F, k), id).gift)));
  const R = Math.max(J, K, L);

  let tier: Tier;
  if (basic && M >= c.t1) tier = "T1";
  else if (basic && M >= c.t2) tier = "T2";
  else if (G !== null && G < 0) tier = "未評価";
  else if (Q !== null && Q >= c.t3) tier = "T3";
  else if (c.rescue && (G === null || G >= 3) && R >= c.t3) tier = "T3";
  else if (G !== null && G <= 2 && (O ?? 0) >= c.hours && (P ?? 0) >= c.events) tier = "T4";
  else tier = "T5";

  let reason: string;
  if (tier === "T1") reason = `基本条件◯・3ヶ月平均${man(c.t1)}以上`;
  else if (tier === "T2") reason = `基本条件◯・3ヶ月平均${man(c.t2)}以上`;
  else if (tier === "未評価") reason = "評価月より後にデビュー";
  else if (tier === "T3")
    reason = Q !== null && Q >= c.t3 ? `デビュー3ヶ月以内に月${man(c.t3)}達成` : `直近3ヶ月に月${man(c.t3)}達成（救済）`;
  else if (tier === "T4") reason = `初月条件◯・月${man(c.t3)}達成待ち`;
  else reason = G !== null && G <= 2 ? `初月条件✕（${c.hours}h・イベント${c.events}回）` : `3ヶ月以内に月${man(c.t3)}未達`;

  const lack = basic ? "" : "・基本条件";
  let next: string;
  if (tier === "T1") next = "維持";
  else if (tier === "T2") next = `T1まで：3ヶ月平均あと${yen(Math.max(0, c.t1 - M))}円${lack}`;
  else if (tier === "T3") next = `T2まで：3ヶ月平均あと${yen(Math.max(0, c.t2 - M))}円${lack}`;
  else if (tier === "T4")
    next = `月${man(c.t3)}まであと${yen(Math.max(0, c.t3 - J))}円（期限：${monthLabel(addMonths(F as number, 2))}）`;
  else if (tier === "未評価") next = "翌月に判定";
  else next = `月${c.hours}h・イベント${c.events}回・月${man(c.t3)}を目指す`;

  return {
    id,
    name: idx.latestName[id] || id,
    rank: idx.rank[`${ev}|${id}`] ?? "",
    debutDate: idx.debutDate[id] ?? "",
    debutMonth: F,
    elapsed: G,
    hours: cur.hours,
    events: cur.events,
    sales: J,
    sales1: K,
    sales2: L,
    avg3: M,
    basic,
    firstHours: O,
    firstEvents: P,
    debutMax: Q,
    recentMax: R,
    tier,
    reason,
    next,
    company: J * c.rate,
  };
}

export const judgeMonth = (idx: MonthlyIndex, m: number, c: Criteria) =>
  (idx.idsByMonth[m] ?? []).map((id) => judge(idx, id, m, c));

export function tierChange(prev: string, cur: string): Change {
  if (!prev) return "新規";
  if (prev === "未評価" || cur === "未評価") return "—";
  const d = tierRank(cur) - tierRank(prev);
  return d < 0 ? "昇格" : d > 0 ? "降格" : "維持";
}

/** 表示する月の既定：設定シートの評価月 → なければ今月より前の最新月 → それもなければ最新月 */
export function defaultMonth(months: number[], c: Criteria, now = new Date()): number | null {
  if (!months.length) return null;
  if (c.evalMonth && months.includes(c.evalMonth)) return c.evalMonth;
  const thisMonth = now.getFullYear() * 100 + now.getMonth() + 1;
  const done = months.filter((m) => m < thisMonth);
  return done.length ? done[done.length - 1] : months[months.length - 1];
}
