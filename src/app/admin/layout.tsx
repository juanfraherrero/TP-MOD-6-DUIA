import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-6">
          <Link href="/admin/activities" className="font-semibold">
            Admin
          </Link>
          <nav className="flex gap-4 text-sm text-gray-700">
            <Link href="/admin/activities" className="hover:underline">
              Actividades
            </Link>
            <Link href="/admin/dashboard" className="hover:underline">
              Dashboard
            </Link>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
