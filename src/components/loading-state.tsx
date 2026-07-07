export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
      <div
        aria-hidden
        className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
      <p className="text-sm">{label}</p>
    </div>
  );
}
