"use client";
import { AppLink } from "@/components/ui/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { FormLayout, FormActions } from "@/components/layout";
import { authClient } from "@/lib/auth-client";
import { registerSchema, type RegisterFormData } from "../schemas/register";
import { AuthCard } from "./AuthCard";
import { PasswordInput } from "./PasswordInput";
export default function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
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
        setError(
          result.error.status === 429
            ? "Too many attempts. Please wait before trying again."
            : "Unable to register. Try again, or sign in if you already have an account.",
        );
        return;
      }
      router.replace("/verify-email");
    } catch {
      setError("Unable to connect. Please try again.");
    }
  }
  return (
    <AuthCard
      title="Register for VulnVault"
      description="Create an account to get started. Verify your email before signing in."
    >
      <FormLayout onSubmit={handleSubmit(onSubmit)} aria-busy={isSubmitting}>
        <FormField
          id="fullName"
          label="Full name"
          error={errors.fullName?.message}
        >
          <Input
            id="fullName"
            autoComplete="name"
            placeholder="John Doe"
            disabled={isSubmitting}
            aria-invalid={!!errors.fullName}
            aria-describedby={errors.fullName ? "fullName-error" : undefined}
            {...register("fullName")}
          />
        </FormField>
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
          description="Use between 8 and 128 characters."
        >
          <PasswordInput
            id="password"
            autoComplete="new-password"
            disabled={isSubmitting}
            aria-invalid={!!errors.password}
            aria-describedby={
              errors.password ? "password-error" : "password-description"
            }
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
        <FormActions>
          <AppLink href="/login" variant="outline">
            Go to login
          </AppLink>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Register"}
          </Button>
        </FormActions>
      </FormLayout>
    </AuthCard>
  );
}
