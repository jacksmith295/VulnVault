import type { Metadata } from "next";
import { EmailRequestForm } from "@/features/auth/components/EmailRequestForm";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return <EmailRequestForm purpose="password-reset" />;
}
