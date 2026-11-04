"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  sessionOptions: { refetchInterval: 60, refetchWhenOffline: false },
  fetchOptions: {
    onRequest(context) {
      // Better Auth 1.7.16 sends a bodyless refresh POST that Next.js exposes as an empty stream.
      // Send explicit JSON so the auth handler can validate its content type and parse it.
      if (context.method === "POST" && new URL(context.url).pathname.endsWith("/get-session") && !context.body) {
        context.headers.set("content-type", "application/json");
        context.body = "{}";
      }
    },
  },
});
