import { cn } from "@/lib/utils";

export function LoadingState({
  maxWidth = "max-w-xl",
  blocks = 1,
}: {
  maxWidth?: string;
  blocks?: number;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex flex-col gap-6 p-6 animate-in fade-in duration-200",
        maxWidth,
      )}
    >
      <div className="flex flex-col gap-2">
        <div className="h-7 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      </div>
      {Array.from({ length: blocks }, (_, index) => (
        <div
          key={index}
          className="h-64 animate-pulse rounded-lg border bg-muted/50"
        />
      ))}
    </div>
  );
}
