import { z } from "zod";

export const loyaltyProgramSchema = z.object({
  name: z.string().trim().min(2, "Program name is required"),
  requiredStamps: z.coerce
    .number()
    .int("Stamps required must be a whole number")
    .min(1, "Stamps required must be at least 1")
    .max(100, "Stamps required must be 100 or fewer"),
  rewardText: z.string().trim().min(2, "Reward text is required"),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});
