import { notFound } from "next/navigation";
import Link from "next/link";
import { getRegistrant } from "@/lib/registrants";
import EditForm from "./EditForm";

export default async function EditRegistrantPage({
  params,
}: {
  params: { id: string };
}) {
  const registrant = await getRegistrant(params.id);
  if (!registrant) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/admin/registrants"
        className="text-sm font-medium text-gray-500 hover:underline"
      >
        ← 登録者一覧に戻る
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-gray-900">登録者情報を編集</h1>
      <p className="mt-1 text-sm text-gray-500">{registrant.stageName} さんの情報</p>

      <div className="mt-6">
        <EditForm registrant={registrant} />
      </div>
    </div>
  );
}
