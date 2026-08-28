import RegisterForm from "./RegisterForm";

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:py-16">
      <RegisterForm />
      <p className="mx-auto mt-6 max-w-xl text-center text-xs text-gray-400">
        管理者の方は{" "}
        <a href="/admin" className="text-brand-600 underline">
          管理画面
        </a>{" "}
        からログインしてください。
      </p>
    </main>
  );
}
