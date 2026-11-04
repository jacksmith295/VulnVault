import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { readServerEnv } from "@/lib/server/env";

const globalDatabase = globalThis as unknown as { vulnvaultPool?: Pool };

// Pool construction is lazy about connections, so builds do not require a running database.
export const pool = globalDatabase.vulnvaultPool ?? new Pool({
  connectionString: readServerEnv().DATABASE_URL,
  max: 10,
});

if (process.env.NODE_ENV !== "production") globalDatabase.vulnvaultPool = pool;

export const db = drizzle(pool, { schema });
