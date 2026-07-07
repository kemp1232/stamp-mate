import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

export function StatCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardContent>
    </Card>
  );
}
