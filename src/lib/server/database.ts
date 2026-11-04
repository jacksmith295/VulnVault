import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "@/db/schema";
import { readServerEnv } from "@/lib/server/env";

const globalDatabase = globalThis as unknown as {
  vulnvaultPool?: Pool;
  vulnvaultAuthThrottlePool?: Pool;
  vulnvaultPoolsErrorsHandled?: WeakSet<Pool>;
};

// Pool construction is lazy about connections, so builds do not require a running database.
export const pool =
  globalDatabase.vulnvaultPool ??
  new Pool({
    connectionString: readServerEnv().DATABASE_URL,
    max: 10,
  });

// Independent bounded connections prevent throttle counters from waiting on a
// full application pool whose credential transactions are awaiting those counters.
export const authThrottlePool =
  globalDatabase.vulnvaultAuthThrottlePool ??
  new Pool({
    connectionString: readServerEnv().DATABASE_URL,
    max: 2,
    allowExitOnIdle: true,
  });

if (process.env.NODE_ENV !== "production") {
  globalDatabase.vulnvaultPool = pool;
  globalDatabase.vulnvaultAuthThrottlePool = authThrottlePool;
}

const observedPools = (globalDatabase.vulnvaultPoolsErrorsHandled ??=
  new WeakSet<Pool>());

for (const connectionPool of [pool, authThrottlePool]) {
  if (observedPools.has(connectionPool)) continue;
  // Checked-out clients can emit errors while password verification is awaiting.
  // The failed query still rejects; listeners prevent an unhandled process error.
  const connectionError = () =>
    console.error("Database connection failed. Check PostgreSQL health.");
  const observedClients = new WeakSet<PoolClient>();
  connectionPool.on("error", connectionError);
  connectionPool.on("acquire", (client) => {
    if (!observedClients.has(client)) {
      client.on("error", connectionError);
      observedClients.add(client);
    }
  });
  observedPools.add(connectionPool);
}

export const db = drizzle(pool, { schema });
export const authThrottleDb = drizzle(authThrottlePool, { schema });
