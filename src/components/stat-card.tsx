import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-4.5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col">
          <CardDescription className="leading-tight">{label}</CardDescription>
          <CardTitle className="text-xl">{value}</CardTitle>
        </div>
      </CardContent>
    </Card>
  );
}
