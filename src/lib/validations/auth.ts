import { z } from "zod";

export const registerSchema = z.object({
  businessName: z.string().trim().min(2, "Business name is required"),
  name: z.string().trim().min(1, "Your name is required"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
