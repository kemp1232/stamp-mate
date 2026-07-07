import Link from "next/link";
import { getCurrentUser } from "@/lib/authorization";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">StampMate</h1>
      <p className="max-w-sm text-muted-foreground">
        QR-based loyalty stamp cards for small businesses.
      </p>
      {user ? (
        <Button nativeButton={false} render={<Link href="/dashboard" />}>
          Go to dashboard
        </Button>
      ) : (
        <div className="flex gap-3">
          <Button nativeButton={false} render={<Link href="/register" />}>
            Register your business
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            Log in
          </Button>
        </div>
      )}
    </div>
  );
}
