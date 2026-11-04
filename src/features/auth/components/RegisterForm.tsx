"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { registerSchema, type RegisterFormData } from "../schemas/register";
import { AuthCard } from "./AuthCard";
import { PasswordInput } from "./PasswordInput";

export default function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" },
  });

  async function onSubmit(data: RegisterFormData) {
    setError("");
    try {
      const result = await authClient.signUp.email({
        name: data.fullName,
        email: data.email,
        password: data.password,
        callbackURL: "/login?verified=true",
      });
      if (result.error) {
        setError(result.error.status === 429
          ? "Too many attempts. Please wait before trying again."
          : "Unable to register. Try again, or sign in if you already have an account.");
        return;
      }
      router.replace("/verify-email");
    } catch {
      setError("Unable to connect. Please try again.");
    }
  }

  return (
    <AuthCard title="Register for VulnVault" description="Create an account to get started. Verify your email before signing in.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" aria-busy={isSubmitting}>
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" autoComplete="name" placeholder="John Doe" disabled={isSubmitting}
            aria-invalid={!!errors.fullName} aria-describedby={errors.fullName ? "name-error" : undefined} {...register("fullName")} />
          {errors.fullName && <p id="name-error" className="text-sm text-destructive">{errors.fullName.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="email@example.com" disabled={isSubmitting}
            aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} {...register("email")} />
          {errors.email && <p id="email-error" className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput id="password" autoComplete="new-password" disabled={isSubmitting}
            aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : "password-help"} {...register("password")} />
          <p id="password-help" className="text-sm text-muted-foreground">Use between 8 and 128 characters.</p>
          {errors.password && <p id="password-error" className="text-sm text-destructive">{errors.password.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <PasswordInput id="confirmPassword" autoComplete="new-password" disabled={isSubmitting}
            aria-invalid={!!errors.confirmPassword} aria-describedby={errors.confirmPassword ? "confirm-error" : undefined} {...register("confirmPassword")} />
          {errors.confirmPassword && <p id="confirm-error" className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="grid grid-cols-2 items-center gap-4">
          <Link href="/login" className="rounded-xl border px-4 py-3 text-center text-sm hover:bg-muted">Go to login</Link>
          <Button type="submit" disabled={isSubmitting} className="h-12 rounded-xl">{isSubmitting ? "Creating account..." : "Register"}</Button>
        </div>
      </form>
    </AuthCard>
  );
}
