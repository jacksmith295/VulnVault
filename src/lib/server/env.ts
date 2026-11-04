import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url().refine((value) => /^postgres(?:ql)?:/.test(value), "Use a PostgreSQL URL"),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_FROM: z.string().min(1),
});

export function readServerEnv(source: NodeJS.ProcessEnv = process.env) {
  const development = source.NODE_ENV !== "production";
  const result = schema.safeParse({
    ...source,
    BETTER_AUTH_URL: source.BETTER_AUTH_URL ?? (development ? "http://localhost:3000" : undefined),
    SMTP_HOST: source.SMTP_HOST ?? (development ? "127.0.0.1" : undefined),
    SMTP_PORT: source.SMTP_PORT ?? (development ? "1025" : undefined),
    SMTP_FROM: source.SMTP_FROM ?? (development ? "VulnVault <noreply@vulnvault.local>" : undefined),
  });

  if (!result.success) {
    // Only report field names: connection URLs and auth secrets must never reach logs.
    throw new Error(`Invalid server configuration: ${[...new Set(result.error.issues.map((issue) => issue.path.join(".")))].join(", ")}`);
  }

  return result.data;
}
