import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing. Set it in .env.local at the repository root.");
}

// Reuse the pool during Next.js development hot reloads.
const globalForDb = globalThis as unknown as { postgresPool?: Pool };
const pool = globalForDb.postgresPool ?? new Pool({ connectionString });

if (process.env.NODE_ENV !== "production") {
  globalForDb.postgresPool = pool;
}

export const db = drizzle(pool, { schema });
