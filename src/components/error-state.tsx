import type { LucideIcon } from "lucide-react";

export function ErrorState({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-2 p-6 text-center animate-in fade-in duration-200">
      {Icon ? (
        <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      ) : null}
      <h1 className="text-xl font-semibold">{title}</h1>
      {description ? (
        <p className="text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
