import { z } from "zod";

export const joinSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number")
    .max(20, "Enter a valid phone number")
    .regex(/^[0-9+()\-.\s]+$/, "Enter a valid phone number"),
});
