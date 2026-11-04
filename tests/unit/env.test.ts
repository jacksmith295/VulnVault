import { describe, expect, it } from "vitest";
import { readServerEnv } from "@/lib/server/env";

const valid: NodeJS.ProcessEnv = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://dev:private-password@127.0.0.1:55432/vulnvault",
  BETTER_AUTH_SECRET: "private-secret-value-at-least-thirty-two-characters",
};

describe("server configuration", () => {
  it("supplies only local email and origin defaults during development", () => {
    const env = readServerEnv(valid);
    expect(env.BETTER_AUTH_URL).toBe("http://localhost:3000");
    expect(env.SMTP_HOST).toBe("127.0.0.1");
    expect(env.SMTP_PORT).toBe(1025);
  });

  it("requires explicit production configuration", () => {
    expect(() => readServerEnv({ ...valid, NODE_ENV: "production" })).toThrow("BETTER_AUTH_URL");
    expect(() => readServerEnv({ ...valid, NODE_ENV: "production" })).toThrow("SMTP_HOST");
  });

  it("does not leak secrets or connection values in validation errors", () => {
    const invalid = { ...valid, DATABASE_URL: "invalid-private-database-url", BETTER_AUTH_SECRET: "short-private-secret" };
    try {
      readServerEnv(invalid);
      throw new Error("Expected configuration failure");
    } catch (error) {
      expect(String(error)).toContain("DATABASE_URL");
      expect(String(error)).not.toContain(invalid.DATABASE_URL);
      expect(String(error)).not.toContain(invalid.BETTER_AUTH_SECRET);
    }
  });
});
