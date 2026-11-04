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
import { loginSchema, type LoginFormData } from "../schemas/login";
import { AuthCard } from "./AuthCard";
import { PasswordInput } from "./PasswordInput";

export default function LoginForm({ notice }: { notice?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(data: LoginFormData) {
    setError("");
    setNeedsVerification(false);
    try {
      const result = await authClient.signIn.email(data);
      if (result.error) {
        if (result.error.code === "EMAIL_NOT_VERIFIED") {
          setNeedsVerification(true);
          setError("Verify your email address before signing in.");
        } else {
          setError(result.error.status === 429
            ? "Too many attempts. Please wait before trying again."
            : "Unable to sign in. Check your email and password.");
        }
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to connect. Please try again.");
    }
  }

  return (
    <AuthCard title="Login to VulnVault" description="Enter your email and password to login">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" aria-busy={isSubmitting}>
        {notice && <p role="status" className="text-sm">{notice}</p>}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="email@example.com"
            disabled={isSubmitting} aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")} />
          {errors.email && <p id="email-error" className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput id="password" autoComplete="current-password" disabled={isSubmitting}
            aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")} />
          {errors.password && <p id="password-error" className="text-sm text-destructive">{errors.password.message}</p>}
          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-sm text-muted-foreground underline underline-offset-4">Forgotten password?</Link>
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {needsVerification && <Link href="/verify-email" className="block text-sm underline underline-offset-4">Resend verification email</Link>}
        <div className="grid grid-cols-2 items-center gap-4">
          <Link href="/register" className="rounded-xl border px-4 py-3 text-center text-sm hover:bg-muted">Register</Link>
          <Button type="submit" disabled={isSubmitting} className="h-12 rounded-xl">{isSubmitting ? "Signing in..." : "Login"}</Button>
        </div>
      </form>
    </AuthCard>
  );
}
