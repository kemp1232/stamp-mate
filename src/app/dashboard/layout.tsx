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
      {children}
    </div>
  );
}
