import type { ReactNode } from "react";
import { requireUser } from "@/lib/authorization";
import { DashboardNav } from "@/components/dashboard-nav";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireUser();
  return (
    <div className="min-h-screen">
      <DashboardNav />
      {/* Clears the fixed mobile tab bar DashboardNav renders below sm —
          otherwise the last bit of every page sits underneath it. */}
      <div className="pb-16 sm:pb-0">{children}</div>
    </div>
  );
}
