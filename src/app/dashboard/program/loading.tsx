export default function ProgramLoading() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-64 animate-pulse rounded-lg border bg-muted/50" />
    </div>
  );
}
