import { EmailRequestForm } from "@/features/auth/components/EmailRequestForm";

export default function VerifyEmailPage() {
  return <EmailRequestForm purpose="verification" />;
}
