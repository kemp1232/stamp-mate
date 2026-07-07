"use client";

import { useActionState } from "react";
import {
  redeemReward,
  type RedeemRewardActionState,
} from "@/lib/actions/rewards";
import { Button } from "@/components/ui/button";

const initialState: RedeemRewardActionState = {};

export function RedeemRewardButton({ cardToken }: { cardToken: string }) {
  const [state, action, isPending] = useActionState(
    redeemReward,
    initialState,
  );

  return (
    <form
      action={action}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          "Redeem this reward? This marks the card as redeemed and starts a new card for the customer.",
        );
        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="cardToken" value={cardToken} />
      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? "Redeeming..." : "Redeem Reward"}
      </Button>
      {state.error ? (
        <p className="mt-2 text-center text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
