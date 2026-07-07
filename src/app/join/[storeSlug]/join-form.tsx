"use client";

import { useActionState } from "react";
import { joinLoyaltyProgram, type JoinActionState } from "@/lib/actions/join";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: JoinActionState = {};

export function JoinForm({ storeSlug }: { storeSlug: string }) {
  const [state, formAction, isPending] = useActionState(
    joinLoyaltyProgram,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="storeSlug" value={storeSlug} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" placeholder="Jane Doe" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Phone number</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          placeholder="555-123-4567"
          required
        />
      </div>
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Joining..." : "Join now"}
      </Button>
    </form>
  );
}
