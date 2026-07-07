import { cn } from "@/lib/utils";

export function StampGrid({
  currentStamps,
  requiredStamps,
}: {
  currentStamps: number;
  requiredStamps: number;
}) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {Array.from({ length: requiredStamps }, (_, index) => {
        const filled = index < currentStamps;
        return (
          <div
            key={index}
            className={cn(
              "flex aspect-square items-center justify-center rounded-full border-2 text-sm font-medium transition-colors",
              filled
                ? "border-primary bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-sm"
                : "border-dashed border-muted-foreground/40 text-muted-foreground",
            )}
          >
            {filled ? "✓" : index + 1}
          </div>
        );
      })}
    </div>
  );
}
