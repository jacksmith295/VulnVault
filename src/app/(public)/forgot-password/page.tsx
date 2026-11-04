import { EmailRequestForm } from "@/features/auth/components/EmailRequestForm";

export default function ForgotPasswordPage() {
  return <EmailRequestForm purpose="password-reset" />;
}
