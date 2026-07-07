"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function LogoutButton({ size }: { size?: "default" | "sm" }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  return (
    <Button
      variant="outline"
      size={size}
      disabled={isPending}
      onClick={async () => {
        setIsPending(true);
        await authClient.signOut();
        router.push("/login");
        router.refresh();
      }}
    >
      {isPending ? "Logging out..." : "Log out"}
    </Button>
  );
}
