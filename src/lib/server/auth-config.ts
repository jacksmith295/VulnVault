import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { z } from "zod";
import { db } from "@/lib/server/database";
import * as schema from "@/db/schema";
import { sendAuthEmail } from "@/lib/server/email";
import { readServerEnv } from "@/lib/server/env";

const env = readServerEnv();

export const auth = betterAuth({
  appName: "VulnVault",
  baseURL: env.BETTER_AUTH_URL,
  logger: {
    level: "error",
    log: () => {
      // Library errors may include SQL parameters or callback tokens. Keep these out of logs.
      console.error("Authentication operation failed. Check database and email service health.");
    },
  },
  secret: env.BETTER_AUTH_SECRET,
  advanced: { disableOriginCheck: false, disableCSRFCheck: false },
  trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin],
  database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendAuthEmail(user.email, "Reset your VulnVault password", `Reset your password using this link:\n\n${url}\n\nThis link expires in one hour. If you did not request it, ignore this email.`);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: false,
    autoSignInAfterVerification: false,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      await sendAuthEmail(user.email, "Verify your VulnVault email", `Verify your email address using this link:\n\n${url}\n\nThis link expires in 24 hours.`);
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    // Server Components read sessions; the browser refreshes them and receives the new cookie.
    deferSessionRefresh: true,
    cookieCache: { enabled: false },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-up/email": { window: 60, max: 5 },
      "/sign-in/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
      "/send-verification-email": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // The workspace schema ships now, but its API waits for the reviewed onboarding slice.
      if (ctx.path.startsWith("/organization/")) {
        throw new APIError("FORBIDDEN", { message: "Workspace management is not available yet." });
      }

      if (ctx.path === "/sign-up/email") {
        const name = z.string().trim().min(2).max(100).safeParse(ctx.body?.name);
        if (!name.success) {
          throw new APIError("BAD_REQUEST", { message: "Enter a name between 2 and 100 characters." });
        }
        return { context: { ...ctx, body: { ...ctx.body, name: name.data } } };
      }
    }),
  },
  plugins: [organization({
    requireEmailVerificationOnInvitation: true,
    invitationExpiresIn: 60 * 60 * 24 * 7,
    disableOrganizationDeletion: true,
  })],
});
