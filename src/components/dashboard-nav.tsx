"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ClipboardList,
  LayoutDashboard,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/logout-button";
import { Logo } from "@/components/logo";

const LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/program", label: "Program", icon: ClipboardList },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/stats", label: "Activity", icon: Activity },
];

function useIsActive(pathname: string) {
  return (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

export function DashboardNav() {
  const pathname = usePathname();
  const isActive = useIsActive(pathname);

  return (
    <>
      <header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-2.5 backdrop-blur-sm sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/dashboard" className="shrink-0">
            <Logo size="sm" />
          </Link>

          <nav className="hidden min-w-0 items-center gap-1 sm:flex">
            {LINKS.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <LogoutButton size="sm" />
        </div>
      </header>

      {/* Bottom tab bar on small screens — a horizontally-scrolling pill row
          crammed between the logo and logout button reads as an afterthought
          on a phone; a fixed, thumb-reachable tab bar is the pattern staff
          actually expect from an app they're using at a counter. Layout.tsx
          reserves matching bottom padding so page content never sits under it. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex border-t bg-background/95 backdrop-blur-sm sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {LINKS.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground active:bg-muted",
              )}
            >
              <span
                className={cn(
                  "absolute top-0 h-0.5 w-8 rounded-full bg-primary transition-opacity",
                  active ? "opacity-100" : "opacity-0",
                )}
                aria-hidden="true"
              />
              <Icon className="size-5" aria-hidden="true" />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
