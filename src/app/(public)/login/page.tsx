import LoginForm from "@/features/auth/components/LoginForm";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const query = await searchParams;
  const notice = query.error
    ? "This verification link is invalid or has expired. Request a new verification email."
    : query.reset === "true"
      ? "Your password has been reset. Sign in with your new password."
      : query.verified === "true"
        ? "Your email has been verified. You can now sign in."
        : undefined;

  return <LoginForm notice={notice} />;
}
