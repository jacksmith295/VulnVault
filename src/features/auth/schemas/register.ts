import { z } from "zod";

export const registerSchema = z
    .object({
        fullName: z
            .string()
            .trim()
            .min(2, "Please enter your full name"),

        email: z
            .email("Please enter a valid email address"),

        password: z
            .string()
            .min(8, "Password must be at least 8 characters"),

        confirmPassword: z.string(),
    })
    .refine(
        ({ password, confirmPassword }) => password === confirmPassword,
        {
            message: "Passwords do not match",
            path: ["confirmPassword"],
        }
    );

export type RegisterFormData = z.infer<typeof registerSchema>;