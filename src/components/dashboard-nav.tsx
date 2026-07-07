"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/logout-button";
import { Logo } from "@/components/logo";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/program", label: "Program" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/stats", label: "Activity" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background px-4 py-2">
      <Link href="/dashboard" className="shrink-0">
        <Logo className="h-7 w-auto" />
      </Link>
      <nav className="flex min-w-0 gap-1 overflow-x-auto">
        {LINKS.map((link) => {
          const isActive =
            link.href === "/dashboard"
              ? pathname === link.href
              : pathname.startsWith(link.href);
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
