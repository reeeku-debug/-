import AdminNav from "../AdminNav";

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      <AdminNav />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
