import type { Metadata } from "next";
import { EmailRequestForm } from "@/features/auth/components/EmailRequestForm";

export const metadata: Metadata = { title: "Verify your email" };

export default function VerifyEmailPage() {
  return <EmailRequestForm purpose="verification" />;
}
