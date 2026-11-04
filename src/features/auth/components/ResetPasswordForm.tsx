"use client";
import { TextLink } from "@/components/ui/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { FormLayout } from "@/components/layout";
import { authClient } from "@/lib/auth-client";
import { AuthCard } from "./AuthCard";
import { PasswordInput } from "./PasswordInput";
const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must be at most 128 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });
  async function onSubmit({ password }: z.infer<typeof resetSchema>) {
    setError("");
    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (result.error) {
        setError(
          result.error.status === 429
            ? "Too many attempts. Please wait before trying again."
            : "Unable to reset your password. The link may have expired or already been used. Request a new link.",
        );
        return;
      }
      router.replace("/login?reset=true");
      router.refresh();
    } catch {
      setError("Unable to connect. Please try again.");
    }
  }
  return (
    <AuthCard
      title="Choose a new password"
      description="Use between 8 and 128 characters. Resetting your password signs out your existing sessions."
    >
      <FormLayout onSubmit={handleSubmit(onSubmit)} aria-busy={isSubmitting}>
        <FormField
          id="password"
          label="New password"
          error={errors.password?.message}
        >
          <PasswordInput
            id="password"
            autoComplete="new-password"
            disabled={isSubmitting}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
        </FormField>
        <FormField
          id="confirmPassword"
          label="Confirm password"
          error={errors.confirmPassword?.message}
        >
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            disabled={isSubmitting}
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={
              errors.confirmPassword ? "confirmPassword-error" : undefined
            }
            {...register("confirmPassword")}
          />
        </FormField>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <Button type="submit" disabled={isSubmitting} fullWidth>
          {isSubmitting ? "Resetting..." : "Reset password"}
        </Button>
        <TextLink href="/forgot-password">Request a new reset link</TextLink>
      </FormLayout>
    </AuthCard>
  );
}
