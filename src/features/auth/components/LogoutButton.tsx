"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Stack } from "@/components/layout";
import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setPending(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError("Unable to log out. Please try again.");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <Stack gap="sm">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={logout}
      >
        {pending ? "Logging out..." : "Log out"}
      </Button>
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </Stack>
  );
}
