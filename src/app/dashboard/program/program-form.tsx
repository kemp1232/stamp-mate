"use client";

import { useActionState } from "react";
import {
  createLoyaltyProgram,
  updateLoyaltyProgram,
  type ProgramActionState,
} from "@/lib/actions/loyalty-program";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Program = {
  id: string;
  name: string;
  requiredStamps: number;
  rewardText: string;
  status: "ACTIVE" | "INACTIVE";
};

const initialState: ProgramActionState = {};

export function ProgramForm({
  businessId,
  program,
}: {
  businessId: string;
  program: Program | null;
}) {
  const action = program ? updateLoyaltyProgram : createLoyaltyProgram;
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {program ? "Edit loyalty program" : "Create your loyalty program"}
        </CardTitle>
        <CardDescription>
          {program
            ? "Update what customers see when they join or check their card."
            : "Customers will see these details when they join with a QR code."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="businessId" value={businessId} />
          {program ? (
            <input type="hidden" name="programId" value={program.id} />
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Program name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={program?.name}
              placeholder="Coffee Club"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="requiredStamps">Stamps required</Label>
            <Input
              id="requiredStamps"
              name="requiredStamps"
              type="number"
              min={1}
              max={100}
              defaultValue={program?.requiredStamps ?? 10}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rewardText">Reward</Label>
            <Input
              id="rewardText"
              name="rewardText"
              defaultValue={program?.rewardText}
              placeholder="Free coffee"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue={program?.status ?? "ACTIVE"}>
              <SelectTrigger id="status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Saved.
            </p>
          ) : null}
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending
              ? "Saving..."
              : program
                ? "Save changes"
                : "Create program"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
