import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface-primary text-text-primary dot-grid">
      <header className="h-18 px-4 sm:px-6 flex items-center bg-transparent shadow-l1">
        <div className="w-full max-w-container mx-auto flex items-center gap-4 sm:gap-8">
          <Link
            href="/admin/activities"
            className="text-body-span font-medium text-text-primary hover:text-text-muted transition-colors"
          >
            Admin
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/admin/activities"
              className="h-8 px-2 inline-flex items-center rounded-md text-link text-text-primary hover:bg-surface-soft hover:text-text-muted transition-colors"
            >
              Actividades
            </Link>
            <Link
              href="/admin/dashboard"
              className="h-8 px-2 inline-flex items-center rounded-md text-link text-text-primary hover:bg-surface-soft hover:text-text-muted transition-colors"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </header>
      <main className="max-w-container mx-auto px-4 sm:px-6 py-6 sm:py-10">{children}</main>
    </div>
  );
}
