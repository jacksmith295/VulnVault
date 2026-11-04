"use client";
import { AppLink, TextLink } from "@/components/ui/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { FormLayout, FormActions, Inline } from "@/components/layout";
import { authClient } from "@/lib/auth-client";
import { loginSchema, type LoginFormData } from "../schemas/login";
import { AuthCard } from "./AuthCard";
import { PasswordInput } from "./PasswordInput";
export default function LoginForm({ notice }: { notice?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
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
          setError(
            result.error.status === 429
              ? "Too many attempts. Please wait before trying again."
              : "Unable to sign in. Check your email and password.",
          );
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
    <AuthCard
      title="Login to VulnVault"
      description="Enter your email and password to login"
    >
      <FormLayout onSubmit={handleSubmit(onSubmit)} aria-busy={isSubmitting}>
        {notice && <FormMessage tone="info">{notice}</FormMessage>}
        <FormField id="email" label="Email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="email@example.com"
            disabled={isSubmitting}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
        </FormField>
        <FormField
          id="password"
          label="Password"
          error={errors.password?.message}
        >
          <PasswordInput
            id="password"
            autoComplete="current-password"
            disabled={isSubmitting}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            {...register("password")}
          />
          <Inline justify="end">
            <TextLink href="/forgot-password">Forgotten password?</TextLink>
          </Inline>
        </FormField>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        {needsVerification && (
          <TextLink href="/verify-email">Resend verification email</TextLink>
        )}
        <FormActions>
          <AppLink href="/register" variant="outline">
            Register
          </AppLink>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Login"}
          </Button>
        </FormActions>
      </FormLayout>
    </AuthCard>
  );
}
