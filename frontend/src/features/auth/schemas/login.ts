import { z } from "zod";

export const loginSchema = z
    .object({
        email: z
            .email("Please enter a valid email address"),

        password: z
            .string()

    });

export type LoginFormData = z.infer<typeof loginSchema>;