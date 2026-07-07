"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/logout-button";

const LINKS = [
  { href: "/staff", label: "Home" },
  { href: "/staff/scan", label: "Scan" },
];

export function StaffNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background px-4 py-2">
      <nav className="flex min-w-0 gap-1 overflow-x-auto">
        {LINKS.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <LogoutButton size="sm" />
    </header>
  );
}
