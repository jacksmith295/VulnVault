"use client";
import { TextLink } from "@/components/ui/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { FormLayout } from "@/components/layout";
import { authClient } from "@/lib/auth-client";
import { AuthCard } from "./AuthCard";
const emailSchema = z.object({
  email: z.string().trim().pipe(z.email("Please enter a valid email address")),
});
type EmailRequestFormProps = {
  purpose: "verification" | "password-reset";
};
export function EmailRequestForm({ purpose }: EmailRequestFormProps) {
  const isVerification = purpose === "verification";
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });
  async function onSubmit({ email }: z.infer<typeof emailSchema>) {
    setMessage("");
    setError("");
    try {
      const result = isVerification
        ? await authClient.sendVerificationEmail({
            email,
            callbackURL: "/login?verified=true",
          })
        : await authClient.requestPasswordReset({
            email,
            redirectTo: `${window.location.origin}/reset-password`,
          });
      if (result.error) {
        setError(
          result.error.status === 429
            ? "Too many requests. Please wait before trying again."
            : "Unable to send your request. Please try again.",
        );
        return;
      }
      setMessage(
        isVerification
          ? "If this address has an account awaiting verification, a verification link has been sent. Check your inbox."
          : "If an account exists for this address, a password reset link has been sent. Check your inbox.",
      );
    } catch {
      setError("Unable to connect. Please try again.");
    }
  }
  return (
    <AuthCard
      title={isVerification ? "Check your email" : "Reset your password"}
      description={
        isVerification
          ? "Follow the verification link in your email, then return to login. Need another link? Enter your email below."
          : "Enter your account email and we'll send a link to choose a new password."
      }
    >
      <FormLayout onSubmit={handleSubmit(onSubmit)} aria-busy={isSubmitting}>
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
        {message && <FormMessage tone="success">{message}</FormMessage>}
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <Button type="submit" disabled={isSubmitting} fullWidth>
          {isSubmitting
            ? "Sending..."
            : isVerification
              ? "Resend verification email"
              : "Send reset link"}
        </Button>
        <TextLink href="/login">Back to login</TextLink>
      </FormLayout>
    </AuthCard>
  );
}
