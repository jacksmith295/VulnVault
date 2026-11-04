"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";

export function SessionMonitor() {
  const router = useRouter();
  // Browser session checks complete deferred refreshes and renew the session cookie.
  const { data, error, isPending, isRefetching } = authClient.useSession();

  useEffect(() => {
    if (isPending || isRefetching) return;
    if ((!error && !data) || error?.status === 401) {
      router.replace("/login");
      router.refresh();
    }
  }, [data, error, isPending, isRefetching, router]);

  return null;
}
