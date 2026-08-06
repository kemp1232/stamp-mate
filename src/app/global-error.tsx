"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import "./globals.css";

// This only renders if the ROOT layout itself throws, so — unlike error.tsx —
// it must supply its own <html>/<body>; Next.js does not fall back to the
// layout that just failed.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled root layout error", error.digest);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-full antialiased">
        <ErrorState
          title="Something went wrong"
          description="The app hit an unexpected error. Please try again."
        />
        <div className="mx-auto flex justify-center pb-10">
          <Button size="lg" onClick={() => reset()}>
            Try again
          </Button>
        </div>
      </body>
    </html>
  );
}
