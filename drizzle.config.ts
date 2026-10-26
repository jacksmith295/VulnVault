import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Use the same .env files as Next.js, including .env.local.
loadEnvConfig(process.cwd());

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Set it in .env.local at the repository root.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
