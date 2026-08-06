"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side details (message/stack) are never shown to the user —
    // only the digest, which is safe to log and lets us correlate this
    // report with the server-side log entry for the same error.
    console.error("Unhandled route error", error.digest);
  }, [error]);

  return (
    <>
      <ErrorState
        title="Something went wrong"
        description="We hit a snag loading this page. You can try again, or head back to safety."
      />
      <div className="mx-auto flex justify-center gap-3 pb-10">
        <Button size="lg" onClick={() => reset()}>
          Try again
        </Button>
        <Button
          size="lg"
          variant="outline"
          nativeButton={false}
          render={<Link href="/" />}
        >
          Go home
        </Button>
      </div>
    </>
  );
}
