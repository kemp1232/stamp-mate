import type { ReactNode } from "react";
import { requireUser } from "@/lib/authorization";
import { StaffNav } from "@/components/staff-nav";

export default async function StaffLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireUser();
  return (
    <div className="min-h-screen">
      <StaffNav />
      {children}
    </div>
  );
}
