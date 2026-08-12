"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function LogoutButton({ size }: { size?: "default" | "sm" }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size={size}
        disabled={isPending}
        onClick={async () => {
          setIsPending(true);
          setError(null);
          // signOut() resolves to `{ error }` on failure — it does not
          // throw. Ignoring that and redirecting unconditionally (as this
          // did before) makes the button always *look* like it worked even
          // when the server rejected the request (e.g. an origin the app
          // doesn't trust): you land on /login, but the session cookie was
          // never cleared, so the next authenticated request quietly logs
          // you back in.
          const { error: signOutError } = await authClient.signOut();
          setIsPending(false);
          if (signOutError) {
            setError("Could not log out. Please try again.");
            return;
          }
          router.push("/login");
          router.refresh();
        }}
      >
        {isPending ? "Logging out..." : "Log out"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
