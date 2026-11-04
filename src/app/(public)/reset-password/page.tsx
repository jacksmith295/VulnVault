import Link from "next/link";

import { AuthCard } from "@/features/auth/components/AuthCard";
import { ResetPasswordForm } from "@/features/auth/components/ResetPasswordForm";

type ResetPasswordPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token, error } = await searchParams;
  if (error || typeof token !== "string" || !token) {
    return (
      <AuthCard title="Request a new reset link" description="This password reset link is missing, invalid, or expired.">
        <Link href="/forgot-password" className="text-sm underline underline-offset-4">Request a new reset link</Link>
      </AuthCard>
    );
  }

  return <ResetPasswordForm token={token} />;
}
