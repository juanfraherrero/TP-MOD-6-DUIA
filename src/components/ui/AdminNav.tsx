"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin/activities", label: "Actividades" },
  { href: "/admin/dashboard", label: "Dashboard" },
];

export function AdminNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="flex items-center gap-1">
      {ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "h-9 px-3 inline-flex items-center rounded-md text-link bg-brand-primary/10 text-brand-primary border border-brand-primary/20 transition-colors"
                : "h-9 px-3 inline-flex items-center rounded-md text-link text-text-secondary hover:bg-surface-soft hover:text-text-primary border border-transparent transition-colors"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
