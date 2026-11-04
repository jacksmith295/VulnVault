import { z } from "zod";

export const registerSchema = z.object({
  fullName: z.string().trim()
    .min(2, "Please enter your full name")
    .max(100, "Name must be at most 100 characters"),
  email: z.string().trim().pipe(z.email("Please enter a valid email address")),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type RegisterFormData = z.infer<typeof registerSchema>;
