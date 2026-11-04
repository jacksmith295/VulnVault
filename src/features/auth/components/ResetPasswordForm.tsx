"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { AuthCard } from "./AuthCard";
import { PasswordInput } from "./PasswordInput";

const resetSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password must be at most 128 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function onSubmit({ password }: z.infer<typeof resetSchema>) {
    setError("");
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setError(result.error.status === 429
          ? "Too many attempts. Please wait before trying again."
          : "Unable to reset your password. The link may have expired or already been used. Request a new link.");
        return;
      }
      router.replace("/login?reset=true");
      router.refresh();
    } catch {
      setError("Unable to connect. Please try again.");
    }
  }

  return (
    <AuthCard title="Choose a new password" description="Use between 8 and 128 characters. Resetting your password signs out your existing sessions.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" aria-busy={isSubmitting}>
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <PasswordInput id="password" autoComplete="new-password" disabled={isSubmitting}
            aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} {...register("password")} />
          {errors.password && <p id="password-error" className="text-sm text-destructive">{errors.password.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <PasswordInput id="confirmPassword" autoComplete="new-password" disabled={isSubmitting}
            aria-invalid={!!errors.confirmPassword} aria-describedby={errors.confirmPassword ? "confirm-error" : undefined} {...register("confirmPassword")} />
          {errors.confirmPassword && <p id="confirm-error" className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={isSubmitting} className="h-12 w-full rounded-xl">{isSubmitting ? "Resetting..." : "Reset password"}</Button>
        <Link href="/forgot-password" className="block text-center text-sm underline underline-offset-4">Request a new reset link</Link>
      </form>
    </AuthCard>
  );
}
