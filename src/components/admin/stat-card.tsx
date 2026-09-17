export function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-400">
        {icon} {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold text-gray-900">{value}</p>
    </div>
  );
}
