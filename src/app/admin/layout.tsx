import Image from "next/image";
import Link from "next/link";
import { AdminNav } from "@/components/ui/AdminNav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface-primary text-text-primary">
      <header className="sticky top-0 z-30 bg-surface-primary/85 backdrop-blur-md border-b border-soft">
        <div className="w-full max-w-container mx-auto h-18 px-4 sm:px-6 flex items-center gap-6 sm:gap-10">
          <Link
            href="/admin/activities"
            className="flex items-center gap-3 shrink-0"
          >
            <Image
              src="/images/icon-2.png"
              alt="La Rioja"
              width={120}
              height={32}
              className="h-7 w-auto"
              priority
            />
            <span className="hidden sm:inline-block h-5 w-px bg-border-medium" />
            <span className="hidden sm:inline text-link text-text-secondary">
              Admin
            </span>
          </Link>
          <AdminNav />
        </div>
        <div className="h-[2px] bg-gradient-to-r from-transparent via-brand-primary/40 to-transparent" />
      </header>
      <main className="max-w-container mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {children}
      </main>
    </div>
  );
}
