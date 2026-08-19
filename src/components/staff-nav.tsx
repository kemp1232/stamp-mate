import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { Logo } from "@/components/logo";

// No nav links here on purpose: /staff *is* the scanner now (see
// staff/page.tsx), so there's nothing left to switch between — the logo
// still links back to it, which doubles as "done, scan the next customer"
// from the card detail page.
export function StaffNav() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-2.5 backdrop-blur-sm sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/staff" className="shrink-0">
          <Logo size="sm" />
        </Link>
        <LogoutButton size="sm" />
      </div>
    </header>
  );
}
