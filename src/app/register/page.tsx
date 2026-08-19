"use client";

import Link from "next/link";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { registerOwner } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(registerOwner, {});

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 animate-in fade-in duration-200">
      <Logo size="md" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle as="h1">Create your business account</CardTitle>
          <CardDescription>
            Register as the owner to set up StampMate for your business.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <Suspense fallback={null}>
              <RedirectToField />
            </Suspense>
            <div className="flex flex-col gap-2">
              <Label htmlFor="businessName">Business name</Label>
              <Input
                id="businessName"
                name="businessName"
                placeholder="Corner Coffee Shop"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" name="name" placeholder="Jane Doe" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                minLength={8}
                required
              />
            </div>
            {state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Creating account..." : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium underline">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// See the matching RedirectToField in src/app/login/page.tsx — same
// deep-link-preservation purpose for the (less common) case where a
// logged-out visitor lands on /register with a redirectTo still set.
function RedirectToField() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo");
  if (!redirectTo) {
    return null;
  }
  return <input type="hidden" name="redirectTo" value={redirectTo} />;
}
