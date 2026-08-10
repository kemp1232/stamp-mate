import Link from "next/link";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <ErrorState
        title="Page not found"
        description="This link may be incorrect, or the page may have moved."
      />
      <div className="mx-auto flex justify-center pb-10">
        <Button size="lg" nativeButton={false} render={<Link href="/" />}>
          Go home
        </Button>
      </div>
    </>
  );
}
