import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { BetterAuthOptions, DBAdapter } from "better-auth/types";
import { APIError, isAPIError } from "better-auth/api";
import { db, authThrottleDb } from "@/lib/server/database";
import * as schema from "@/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Operation =
  | "signInEmail"
  | "resetPassword"
  | "changePassword"
  | "setPassword"
  | "unlinkAccount";
type State = {
  transaction: Transaction;
  adapter: DBAdapter;
  operation: Operation;
  userId?: string;
};

const paths: Record<string, Operation> = {
  "/sign-in/email": "signInEmail",
  "/reset-password": "resetPassword",
  "/change-password": "changePassword",
  "/unlink-account": "unlinkAccount",
};

async function databaseOperation<T>(callback: () => Promise<T>): Promise<T> {
  try {
    return await callback();
  } catch (error) {
    if (isAPIError(error)) throw error;
    // The router can log adapter failures independently of the configured logger.
    // Never allow SQL parameters, including new session tokens, across this boundary.
    throw new APIError("INTERNAL_SERVER_ERROR", {
      message: "Authentication operation failed.",
    });
  }
}

function requestOperation(request: Request): Operation | undefined {
  if (request.method !== "POST") return;
  let path: string;
  try {
    path = decodeURIComponent(new URL(request.url).pathname)
      .replace(/\/+/g, "/")
      .replace(/\/$/, "");
  } catch {
    return;
  }
  return Object.entries(paths).find(([suffix]) => path.endsWith(suffix))?.[1];
}

/** Pinned Better Auth integration: credential reads and their writes share one connection. */
export function createCredentialGuard() {
  const requests = new AsyncLocalStorage<State>();
  let options: BetterAuthOptions;
  let dispatch: DBAdapter;

  function transactionAdapter(transaction: Transaction) {
    return drizzleAdapter(transaction, {
      provider: "pg",
      schema,
      transaction: true,
    })(options);
  }

  async function lockIdentity(state: State, model: string, result: unknown) {
    if (state.userId || !result) return false;
    const row = (Array.isArray(result) ? result[0] : result) as
      Record<string, unknown> | undefined;
    if (!row) return false;
    let userId: unknown;
    if (state.operation === "signInEmail" && model === "user") userId = row.id;
    if (state.operation === "resetPassword" && model === "verification")
      userId = row.value;
    if (
      ["changePassword", "setPassword", "unlinkAccount"].includes(
        state.operation,
      ) &&
      model === "session"
    )
      userId = row.userId;
    if (typeof userId !== "string") return false;
    await state.transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`vulnvault:credential:${userId}`}, 0))`,
    );
    state.userId = userId;
    return true;
  }

  const database = (configuration: BetterAuthOptions): DBAdapter => {
    options = configuration;
    const base = drizzleAdapter(db, {
      provider: "pg",
      schema,
      transaction: true,
    })(configuration);
    const throttle = drizzleAdapter(authThrottleDb, {
      provider: "pg",
      schema,
      transaction: false,
    })(configuration);
    dispatch = new Proxy(base, {
      get(target, property) {
        if (property === "transaction") {
          return async (callback: Parameters<DBAdapter["transaction"]>[0]) =>
            databaseOperation(async () => {
              const state = requests.getStore();
              if (!state) return target.transaction(callback);
              // HTTP converts endpoint failures to responses. A savepoint still rolls back
              // token consumption and revocation before that error is caught by the router.
              return state.transaction.transaction(async (nested) =>
                requests.run(
                  {
                    ...state,
                    transaction: nested,
                    adapter: transactionAdapter(nested),
                  },
                  () => callback(dispatch),
                ),
              );
            });
        }
        const value = Reflect.get(target, property);
        if (typeof value !== "function") return value;
        return async (...args: unknown[]) =>
          databaseOperation(async () => {
            const state = requests.getStore();
            const query = args[0] as { model?: string } | undefined;
            // Throttle counters commit independently and must not hold a shared
            // bucket row lock for the duration of password verification.
            const adapter =
              query?.model === "rateLimit"
                ? throttle
                : (state?.adapter ?? target);
            const method = Reflect.get(adapter, property);
            if (
              state &&
              !state.userId &&
              (query?.model === "account" || query?.model === "session") &&
              !["findOne", "findMany", "count"].includes(String(property))
            ) {
              // Upstream route changes must fail closed if the expected identity read moves.
              throw new APIError("INTERNAL_SERVER_ERROR", {
                message: "Authentication operation failed.",
              });
            }
            const result: unknown = await Reflect.apply(method, adapter, args);
            if (state && (property === "findOne" || property === "findMany")) {
              if (await lockIdentity(state, query!.model!, result)) {
                // Read Committed gives a fresh snapshot after waiting for recovery.
                return Reflect.apply(method, adapter, args);
              }
            }
            return result;
          });
      },
    });
    return dispatch;
  };

  async function run<T>(operation: Operation, callback: () => Promise<T>) {
    return databaseOperation(() =>
      db.transaction(
        async (transaction) =>
          requests.run(
            {
              transaction,
              adapter: transactionAdapter(transaction),
              operation,
            },
            callback,
          ),
        { isolationLevel: "read committed" },
      ),
    );
  }

  function protect<
    T extends {
      handler: (request: Request) => Promise<Response>;
      fetch: (request: Request) => Promise<Response>;
      api: object;
      $context: Promise<unknown>;
    },
  >(auth: T): T {
    const handler = async (request: Request) => {
      const operation = requestOperation(request);
      if (operation) await auth.$context;
      if (!operation) return auth.handler(request);
      try {
        return await run(operation, () => auth.handler(request));
      } catch {
        return Response.json(
          {
            code: "INTERNAL_SERVER_ERROR",
            message: "Authentication operation failed.",
          },
          { status: 500 },
        );
      }
    };
    const operations = new Set<Operation>([
      "signInEmail",
      "resetPassword",
      "changePassword",
      "setPassword",
      "unlinkAccount",
    ]);
    return {
      ...auth,
      handler,
      fetch: handler,
      api: new Proxy(auth.api, {
        get(target, property, receiver) {
          const endpoint = Reflect.get(target, property, receiver);
          if (
            typeof property !== "string" ||
            !operations.has(property as Operation) ||
            typeof endpoint !== "function"
          )
            return endpoint;
          return new Proxy(endpoint, {
            apply(fn, thisArgument, argumentsList) {
              return auth.$context.then(() =>
                run(property as Operation, () =>
                  Promise.resolve(
                    Reflect.apply(fn, thisArgument, argumentsList),
                  ),
                ),
              );
            },
          });
        },
      }),
    };
  }

  return { database, protect };
}
