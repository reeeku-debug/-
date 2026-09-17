import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { searchTalentRoster } from "@/lib/roster";
import { GENDER_OPTIONS, PAYMENT_STATUS_OPTIONS, TALENT_STATUS_OPTIONS } from "@/lib/constants";
import TalentRosterTable from "@/components/admin/talent-roster-table";

interface RosterSearchParams {
  q?: string;
  companyId?: string;
  gender?: string;
  status?: string;
  paymentStatus?: string;
  registeredMonth?: string;
  needsReview?: string;
  page?: string;
}

function pageHref(searchParams: RosterSearchParams, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key !== "page" && value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin/roster?${qs}` : "/admin/roster";
}

export default async function RosterPage({ searchParams }: { searchParams: RosterSearchParams }) {
  const [{ talents, total, page, totalPages }, companies] = await Promise.all([
    searchTalentRoster(searchParams),
    prisma.company.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">タレント一覧</h1>
          <p className="text-sm text-gray-500">全 {total} 件</p>
        </div>
        <Link href="/admin/roster/new" className="btn-primary">
          ＋タレントを登録
        </Link>
      </div>

      <form className="card grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input
          type="text"
          name="q"
          defaultValue={searchParams.q}
          placeholder="No.・本名・読み方・所属事務所で検索"
          className="field-input lg:col-span-2"
        />
        <select name="companyId" defaultValue={searchParams.companyId ?? ""} className="field-input">
          <option value="">所属事務所（すべて）</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="gender" defaultValue={searchParams.gender ?? ""} className="field-input">
          <option value="">性別（すべて）</option>
          {GENDER_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={searchParams.status ?? ""} className="field-input">
          <option value="">在籍状況（すべて）</option>
          {TALENT_STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select name="paymentStatus" defaultValue={searchParams.paymentStatus ?? ""} className="field-input">
          <option value="">当月入金状況（すべて）</option>
          {PAYMENT_STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          type="month"
          name="registeredMonth"
          defaultValue={searchParams.registeredMonth}
          className="field-input"
          aria-label="登録年月"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" name="needsReview" value="1" defaultChecked={searchParams.needsReview === "1"} />
          要確認のみ表示
        </label>
        <div className="flex gap-2 lg:col-span-2">
          <button type="submit" className="btn-primary whitespace-nowrap">
            検索する
          </button>
          <Link href="/admin/roster" className="btn-secondary whitespace-nowrap">
            条件をクリア
          </Link>
        </div>
      </form>

      <TalentRosterTable talents={talents} />

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <PagerLink searchParams={searchParams} page={page - 1} disabled={page <= 1}>
            ← 前へ
          </PagerLink>
          <span className="text-gray-500">
            {page} / {totalPages} ページ
          </span>
          <PagerLink searchParams={searchParams} page={page + 1} disabled={page >= totalPages}>
            次へ →
          </PagerLink>
        </div>
      )}
    </div>
  );
}

function PagerLink({
  searchParams,
  page,
  disabled,
  children,
}: {
  searchParams: RosterSearchParams;
  page: number;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="btn-secondary cursor-not-allowed opacity-50">{children}</span>;
  }
  return (
    <Link href={pageHref(searchParams, page)} className="btn-secondary">
      {children}
    </Link>
  );
}
