import { CreateTalentForm } from "@/components/admin/create-talent-form";

export default function NewTalentPage() {
  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold">タレントを追加</h1>
        <p className="mt-1 text-sm text-gray-500">
          登録すると専用のログインID・パスワード・URLが自動発行されます。
        </p>
      </div>
      <CreateTalentForm />
    </div>
  );
}
