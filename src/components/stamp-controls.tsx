"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  addStamp,
  undoLastStamp,
  type StampActionState,
} from "@/lib/actions/stamp";
import { Button } from "@/components/ui/button";

const initialState: StampActionState = {};

export function StampControls({
  cardToken,
  canAddStamp,
  canUndo,
}: {
  cardToken: string;
  canAddStamp: boolean;
  canUndo: boolean;
}) {
  const router = useRouter();

  const [addState, addAction, isAdding] = useActionState(
    addStamp,
    initialState,
  );
  const [undoState, undoAction, isUndoing] = useActionState(
    undoLastStamp,
    initialState,
  );

  // Each action's returned state is a fresh object every time it completes,
  // so this fires right after add/undo settles — refreshing the page's
  // server-rendered stamp count/status/history without a full reload.
  useEffect(() => {
    if (addState !== initialState) {
      router.refresh();
    }
  }, [addState, router]);

  useEffect(() => {
    if (undoState !== initialState) {
      router.refresh();
    }
  }, [undoState, router]);

  return (
    <div className="flex flex-col gap-3">
      <form action={addAction}>
        <input type="hidden" name="cardToken" value={cardToken} />
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!canAddStamp || isAdding}
        >
          {isAdding ? "Adding stamp..." : "Add Stamp"}
        </Button>
      </form>
      {addState.error ? (
        <p className="text-sm text-destructive">{addState.error}</p>
      ) : null}
      {addState.success ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          {addState.success}
        </p>
      ) : null}

      <form action={undoAction}>
        <input type="hidden" name="cardToken" value={cardToken} />
        <Button
          type="submit"
          variant="outline"
          size="lg"
          className="w-full"
          disabled={!canUndo || isUndoing}
        >
          {isUndoing ? "Undoing..." : "Undo Last Stamp"}
        </Button>
      </form>
      {undoState.error ? (
        <p className="text-sm text-destructive">{undoState.error}</p>
      ) : null}
      {undoState.success ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          {undoState.success}
        </p>
      ) : null}
    </div>
  );
}
