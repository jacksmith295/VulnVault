import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createEmailVerificationToken } from "better-auth/api";

const sentEmails = vi.hoisted(
  () => [] as { to: string; subject: string; text: string }[],
);
vi.mock("@/lib/server/email", () => ({
  sendAuthEmail: vi.fn(async (to: string, subject: string, text: string) => {
    sentEmails.push({ to, subject, text });
  }),
}));

import { auth } from "@/lib/auth";
import { db, pool } from "@/db";
import { authThrottlePool } from "@/lib/server/database";
import {
  account,
  legacyUsers,
  member,
  organization,
  session,
  user,
  verification,
} from "@/db/schema";
import { resetAuthRateLimits } from "../helpers/auth-rate-limits";

const runId = randomUUID();
const password = "correct-horse-battery-staple";
const legacyFixture = {
  id: randomUUID(),
  fullName: "Existing VulnVault Developer",
  email: `legacy-${runId}@example.com`,
  passwordHash: "pre-authentication-fixture-hash",
};
let addressCounter = 0;
const addressPrefix = `${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;

function newAddress() {
  return `198.${addressPrefix}.${++addressCounter}`;
}

async function request(
  path: string,
  body?: Record<string, unknown>,
  cookie?: string,
  ip = newAddress(),
) {
  const headers = new Headers({
    origin: "http://localhost:3000",
    "x-forwarded-for": ip,
  });
  if (body) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  return auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
}

function emailLink(email: string, subject: string) {
  const message = sentEmails.findLast(
    (item) => item.to === email && item.subject.includes(subject),
  );
  if (!message) throw new Error("Expected auth email was not dispatched");
  return new URL(message.text.match(/https?:\/\/[^\s]+/)![0]);
}

async function register(label: string, verify = true) {
  const email = `${label}-${runId}@example.com`;
  const response = await request("/sign-up/email", {
    name: "Test Developer",
    email,
    password,
    callbackURL: "/login?verified=true",
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie") ?? "").not.toContain(
    "session_token",
  );
  const result = await response.json();
  if (verify) {
    const link = emailLink(email, "Verify");
    const verified = await auth.handler(new Request(link));
    expect(verified.status).toBe(302);
    expect(verified.headers.get("set-cookie") ?? "").not.toContain(
      "session_token",
    );
  }
  return { email, id: result.user.id as string };
}

async function login(email: string, suppliedPassword = password) {
  const response = await request("/sign-in/email", {
    email,
    password: suppliedPassword,
  });
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  return { response, cookie };
}

beforeAll(async () => {
  const baselineFolder = await mkdtemp(
    join(tmpdir(), "vulnvault-baseline-migration-"),
  );
  try {
    const journal = JSON.parse(
      await readFile("./drizzle/meta/_journal.json", "utf8"),
    );
    const baseline = journal.entries[0];
    expect(baseline.tag).toBe("0000_early_bucky");
    await mkdir(join(baselineFolder, "meta"));
    await writeFile(
      join(baselineFolder, "meta", "_journal.json"),
      JSON.stringify({
        ...journal,
        entries: [baseline],
      }),
    );
    await copyFile(
      `./drizzle/${baseline.tag}.sql`,
      join(baselineFolder, `${baseline.tag}.sql`),
    );

    // On a fresh test database, insert old-format data before the auth upgrade runs.
    // On subsequent runs both migrator calls are no-ops, preserving repeatability.
    await migrate(db, { migrationsFolder: baselineFolder });
    await db.insert(legacyUsers).values(legacyFixture);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await resetAuthRateLimits();
  } finally {
    await rm(baselineFolder, { recursive: true, force: true });
  }
});

beforeEach(resetAuthRateLimits);

afterAll(async () => {
  await db.delete(legacyUsers).where(eq(legacyUsers.id, legacyFixture.id));
  const users = await db
    .select({ id: user.id })
    .from(user)
    .where(like(user.email, `%${runId}@example.com`));
  if (users.length) {
    await db.delete(verification).where(
      inArray(
        verification.value,
        users.map((item) => item.id),
      ),
    );
    await db.delete(user).where(
      inArray(
        user.id,
        users.map((item) => item.id),
      ),
    );
  }
  await pool.end();
  await authThrottlePool.end();
});

describe("real authentication and persistence", () => {
  it("accepts a credential API call as the first auth operation after initialization", async () => {
    const response = await auth.api.signInEmail({
      body: { email: `cold-${runId}@example.com`, password },
      asResponse: true,
    });
    expect(response.status).toBe(401);
  });

  it("finishes throttled requests when every application-pool connection is occupied", async () => {
    const concurrency = pool.options.max!;
    const originalTransaction = db.transaction.bind(db);
    let entered = 0;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transactions = vi
      .spyOn(db, "transaction")
      .mockImplementation((callback, configuration) =>
        originalTransaction(async (transaction) => {
          // Bound a broken implementation's wait so a regression cannot strand the suite.
          await transaction.execute(
            sql`set local idle_in_transaction_session_timeout = '5000ms'`,
          );
          if (++entered === concurrency) release();
          await ready;
          return callback(transaction);
        }, configuration),
      );
    try {
      const responses = await Promise.all(
        Array.from({ length: concurrency + 2 }, () =>
          request("/sign-in/email", {
            email: `saturation-${runId}@example.com`,
            password,
          }),
        ),
      );
      expect(entered).toBe(concurrency + 2);
      expect(
        responses.filter((response) => response.status === 401),
      ).toHaveLength(5);
      expect(
        responses.filter((response) => response.status === 429),
      ).toHaveLength(concurrency - 3);
    } finally {
      release();
      transactions.mockRestore();
    }
  });

  it("preserves published pre-authentication users when applying the auth migrations", async () => {
    expect(
      await db
        .select()
        .from(legacyUsers)
        .where(eq(legacyUsers.id, legacyFixture.id)),
    ).toEqual([legacyFixture]);
  });

  it("requires verification and creates neither a session nor a workspace on registration", async () => {
    const person = await register("unverified", false);
    expect((await login(person.email)).response.status).toBe(403);
    expect(
      await db.select().from(session).where(eq(session.userId, person.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(member).where(eq(member.userId, person.id)),
    ).toHaveLength(0);
    const credentials = await db
      .select()
      .from(account)
      .where(eq(account.userId, person.id));
    expect(credentials[0].password).toBeTruthy();
    expect(credentials[0].password).not.toBe(password);
  });

  it("supports verified sign-in, returns no session to signed-out callers, and revokes logout", async () => {
    const person = await register("login");
    expect(await (await request("/get-session")).json()).toBeNull();
    const signedIn = await login(person.email);
    expect(signedIn.response.status).toBe(200);
    expect(signedIn.cookie).toContain("session_token");
    const current = await (
      await request("/get-session", undefined, signedIn.cookie)
    ).json();
    expect(current.user.id).toBe(person.id);
    const stored = await db
      .select()
      .from(session)
      .where(eq(session.userId, person.id));
    expect(stored[0].expiresAt.getTime() - Date.now()).toBeGreaterThan(
      6 * 24 * 60 * 60 * 1000,
    );
    expect((await request("/sign-out", {}, signedIn.cookie)).status).toBe(200);
    expect(
      await (await request("/get-session", undefined, signedIn.cookie)).json(),
    ).toBeNull();
  });

  it("rejects wrong credentials, invalid names, and short passwords on the server", async () => {
    const person = await register("bad-password");
    expect((await login(person.email, "wrong-password")).response.status).toBe(
      401,
    );
    const short = await request("/sign-up/email", {
      name: "Valid Name",
      email: `short-${runId}@example.com`,
      password: "short",
    });
    expect(short.status).toBe(400);
    const invalidName = await request("/sign-up/email", {
      name: "  ",
      email: `name-${runId}@example.com`,
      password,
    });
    expect(invalidName.status).toBe(400);
  });

  it("does not accept an expired verification link", async () => {
    const person = await register("expired-verification", false);
    const token = await createEmailVerificationToken(
      process.env.BETTER_AUTH_SECRET!,
      person.email,
      undefined,
      -60,
      { userId: person.id },
    );
    const response = await request(
      `/verify-email?token=${encodeURIComponent(token)}&callbackURL=/login`,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("error=");
    expect(
      (await db.select().from(user).where(eq(user.id, person.id)))[0]
        .emailVerified,
    ).toBe(false);
  });

  it("resends verification and rejects callback URLs outside the trusted origin", async () => {
    const person = await register("resend", false);
    const count = sentEmails.filter((item) => item.to === person.email).length;
    const resent = await request("/send-verification-email", {
      email: person.email,
      callbackURL: "/login?verified=true",
    });
    expect(resent.status).toBe(200);
    expect(sentEmails.filter((item) => item.to === person.email)).toHaveLength(
      count + 1,
    );
    const rejected = await request("/request-password-reset", {
      email: person.email,
      redirectTo: "https://attacker.example/reset",
    });
    expect(rejected.status).toBe(403);
  });

  it("makes password reset single-use and invalidates all existing sessions", async () => {
    const person = await register("reset");
    const first = await login(person.email);
    const second = await login(person.email);
    expect(
      (
        await request("/request-password-reset", {
          email: person.email,
          redirectTo: "http://localhost:3000/reset-password",
        })
      ).status,
    ).toBe(200);
    const link = emailLink(person.email, "Reset");
    const token = link.pathname.split("/").at(-1)!;
    const changed = await request("/reset-password", {
      token,
      newPassword: "new-correct-horse-battery",
    });
    expect(changed.status).toBe(200);
    expect(
      await db.select().from(session).where(eq(session.userId, person.id)),
    ).toHaveLength(0);
    for (const cookie of [first.cookie, second.cookie]) {
      expect(
        await (await request("/get-session", undefined, cookie)).json(),
      ).toBeNull();
    }
    expect(
      (
        await request("/reset-password", {
          token,
          newPassword: "another-new-password",
        })
      ).status,
    ).toBe(400);
    expect((await login(person.email)).response.status).toBe(401);
    expect(
      (await login(person.email, "new-correct-horse-battery")).response.status,
    ).toBe(200);
  });

  it("rejects expired reset credentials and keeps unknown-email reset responses generic", async () => {
    const person = await register("expired-reset");
    const existing = await request("/request-password-reset", {
      email: person.email,
    });
    const absent = await request("/request-password-reset", {
      email: `absent-${runId}@example.com`,
    });
    expect(await absent.json()).toEqual(await existing.json());
    const token = emailLink(person.email, "Reset").pathname.split("/").at(-1)!;
    await db
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(verification.value, person.id));
    expect(
      (
        await request("/reset-password", {
          token,
          newPassword: "new-correct-horse-battery",
        })
      ).status,
    ).toBe(400);
  });

  for (const operation of ["sign-in", "change-password"] as const) {
    it(`prevents an in-flight ${operation} from restoring access after password recovery`, async () => {
      const person = await register(`recovery-race-${operation}`);
      const unrelated =
        operation === "sign-in"
          ? await register("independent-login")
          : undefined;
      const signedIn = await login(person.email);
      expect(signedIn.response.status).toBe(200);
      expect(
        (await request("/request-password-reset", { email: person.email }))
          .status,
      ).toBe(200);
      const token = emailLink(person.email, "Reset")
        .pathname.split("/")
        .at(-1)!;
      const context = await auth.$context;
      const originalVerify = context.password.verify;
      let verificationReached!: () => void;
      let releaseVerification!: () => void;
      const reached = new Promise<void>((resolve) => {
        verificationReached = resolve;
      });
      const released = new Promise<void>((resolve) => {
        releaseVerification = resolve;
      });
      const verify = vi
        .spyOn(context.password, "verify")
        .mockImplementationOnce(async (input) => {
          const valid = await originalVerify(input);
          verificationReached();
          await released;
          return valid;
        });
      let pending: Promise<Response> | undefined;
      try {
        pending =
          operation === "sign-in"
            ? request("/sign-in/email", { email: person.email, password })
            : request(
                "/change-password",
                {
                  currentPassword: password,
                  newPassword: "attacker-chosen-password",
                  revokeOtherSessions: true,
                },
                signedIn.cookie,
              );
        await reached;
        if (unrelated)
          expect((await login(unrelated.email)).response.status).toBe(200);
        const recovery = request(
          `/reset-password?token=${encodeURIComponent(token)}`,
          { newPassword: "recovered-correct-password" },
        );
        await vi.waitFor(async () => {
          const waiting = await db.execute(
            sql`select 1 from pg_locks where locktype = 'advisory' and not granted`,
          );
          expect(waiting.rows).not.toHaveLength(0);
        });
        releaseVerification();
        await pending;
        expect((await recovery).status).toBe(200);
        expect(
          await db.select().from(session).where(eq(session.userId, person.id)),
        ).toHaveLength(0);
        expect(
          (await login(person.email, "attacker-chosen-password")).response
            .status,
        ).toBe(401);
        expect(
          (await login(person.email, "recovered-correct-password")).response
            .status,
        ).toBe(200);
      } finally {
        releaseVerification();
        if (pending) await pending;
        verify.mockRestore();
      }
    });
  }

  for (const operation of ["sign-in", "change-password"] as const) {
    it(`rechecks credentials and sessions when recovery wins before direct API ${operation}`, async () => {
      const person = await register(`recovery-first-${operation}`);
      const signedIn = await login(person.email);
      await request("/request-password-reset", { email: person.email });
      const token = emailLink(person.email, "Reset")
        .pathname.split("/")
        .at(-1)!;
      const context = await auth.$context;
      const originalHash = context.password.hash;
      let hashReached!: () => void;
      let releaseHash!: () => void;
      const reached = new Promise<void>((resolve) => {
        hashReached = resolve;
      });
      const released = new Promise<void>((resolve) => {
        releaseHash = resolve;
      });
      const hash = vi
        .spyOn(context.password, "hash")
        .mockImplementationOnce(async (input) => {
          const result = await originalHash(input);
          hashReached();
          await released;
          return result;
        });
      const recovery = auth.api.resetPassword({
        body: { token, newPassword: "recovery-wins-password" },
        asResponse: true,
      });
      let pending: Promise<Response> | undefined;
      try {
        await reached;
        pending =
          operation === "sign-in"
            ? auth.api.signInEmail({
                body: { email: person.email, password },
                asResponse: true,
              })
            : auth.api.changePassword({
                headers: new Headers({ cookie: signedIn.cookie }),
                body: {
                  currentPassword: password,
                  newPassword: "attacker-chosen-password",
                  revokeOtherSessions: true,
                },
                asResponse: true,
              });
        await vi.waitFor(async () => {
          const waiting = await db.execute(
            sql`select 1 from pg_locks where locktype = 'advisory' and not granted`,
          );
          expect(waiting.rows).not.toHaveLength(0);
        });
        releaseHash();
        expect((await recovery).status).toBe(200);
        expect((await pending).status).toBe(401);
        expect(
          await db.select().from(session).where(eq(session.userId, person.id)),
        ).toHaveLength(0);
        expect(
          (await login(person.email, "recovery-wins-password")).response.status,
        ).toBe(200);
      } finally {
        releaseHash();
        await recovery;
        if (pending) await pending;
        hash.mockRestore();
      }
    });
  }

  it("keeps credential updates, session revocation, and replacement sessions on the locked transaction connection", async () => {
    const person = await register("connection-proof");
    const signedIn = await login(person.email);
    const fixtureSchema = `auth_guard_${runId.replaceAll("-", "")}`;
    await db.execute(
      sql.raw(`create schema ${fixtureSchema};
      create table ${fixtureSchema}.audit (operation text, transaction_id bigint, backend_pid integer, locked boolean);
      create function ${fixtureSchema}.audit_write() returns trigger language plpgsql as $$
      begin
        if coalesce(new.user_id, old.user_id) = TG_ARGV[0] then
          insert into ${fixtureSchema}.audit values (TG_OP, txid_current(), pg_backend_pid(),
            exists(select 1 from pg_locks where pid = pg_backend_pid() and locktype = 'advisory' and granted));
        end if;
        return coalesce(new, old);
      end $$;`),
    );
    try {
      // User IDs are generated by Better Auth, never provided by a request.
      expect(person.id).toMatch(/^[a-zA-Z0-9]+$/);
      for (const table of ["account", "session"]) {
        await db.execute(
          sql.raw(
            `create trigger auth_guard_audit before insert or update or delete on "${table}" for each row execute function ${fixtureSchema}.audit_write('${person.id}')`,
          ),
        );
      }
      const changed = await request(
        "/change-password",
        {
          currentPassword: password,
          newPassword: "connection-proof-password",
          revokeOtherSessions: true,
        },
        signedIn.cookie,
      );
      expect(changed.status).toBe(200);
      const audit = await db.execute<{
        operation: string;
        transaction_id: string;
        backend_pid: number;
        locked: boolean;
      }>(sql.raw(`select * from ${fixtureSchema}.audit`));
      expect(audit.rows.map((row) => row.operation).sort()).toEqual([
        "DELETE",
        "INSERT",
        "UPDATE",
      ]);
      expect(new Set(audit.rows.map((row) => row.transaction_id)).size).toBe(1);
      expect(new Set(audit.rows.map((row) => row.backend_pid)).size).toBe(1);
      expect(audit.rows.every((row) => row.locked)).toBe(true);
    } finally {
      await db.execute(
        sql.raw(
          `drop trigger if exists auth_guard_audit on account; drop trigger if exists auth_guard_audit on session; drop schema ${fixtureSchema} cascade`,
        ),
      );
    }
  });

  it("rolls back reset token consumption and session revocation when the HTTP credential write fails", async () => {
    const person = await register("reset-rollback");
    const signedIn = await login(person.email);
    await request("/request-password-reset", { email: person.email });
    const token = emailLink(person.email, "Reset").pathname.split("/").at(-1)!;
    const before = await db
      .select()
      .from(account)
      .where(eq(account.userId, person.id));
    const functionName = `auth_guard_failure_${runId.replaceAll("-", "")}`;
    expect(person.id).toMatch(/^[a-zA-Z0-9]+$/);
    await db.execute(
      sql.raw(`create function ${functionName}() returns trigger language plpgsql as $$
      begin if new.user_id = '${person.id}' then raise exception 'Injected credential persistence failure'; end if; return new; end $$;
      create trigger auth_guard_failure before update on account for each row execute function ${functionName}()`),
    );
    try {
      expect(
        (
          await request("/reset-password", {
            token,
            newPassword: "rollback-recovery-password",
          })
        ).status,
      ).toBe(500);
      expect(
        await db.select().from(account).where(eq(account.userId, person.id)),
      ).toEqual(before);
      expect(
        await db.select().from(session).where(eq(session.userId, person.id)),
      ).toHaveLength(1);
      expect(
        await db
          .select()
          .from(verification)
          .where(eq(verification.value, person.id)),
      ).toHaveLength(1);
      expect(
        (
          await (
            await request("/get-session", undefined, signedIn.cookie)
          ).json()
        ).user.id,
      ).toBe(person.id);
    } finally {
      await db.execute(
        sql.raw(
          `drop trigger auth_guard_failure on account; drop function ${functionName}()`,
        ),
      );
    }
    expect(
      (
        await request("/reset-password", {
          token,
          newPassword: "rollback-recovery-password",
        })
      ).status,
    ).toBe(200);
    expect(
      await db.select().from(session).where(eq(session.userId, person.id)),
    ).toHaveLength(0);
  });

  it("fails closed when the locked PostgreSQL connection is lost and permits a later request", async () => {
    const person = await register("connection-loss");
    const functionName = `auth_guard_disconnect_${runId.replaceAll("-", "")}`;
    expect(person.id).toMatch(/^[a-zA-Z0-9]+$/);
    await db.execute(
      sql.raw(`create function ${functionName}() returns trigger language plpgsql as $$
      begin if new.user_id = '${person.id}' then perform pg_terminate_backend(pg_backend_pid()); end if; return new; end $$;
      create trigger auth_guard_disconnect before insert on session for each row execute function ${functionName}()`),
    );
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failed = await login(person.email);
      expect(failed.response.status).toBe(500);
      expect(await failed.response.json()).toEqual({
        code: "INTERNAL_SERVER_ERROR",
        message: "Authentication operation failed.",
      });
      expect(
        await db.select().from(session).where(eq(session.userId, person.id)),
      ).toHaveLength(0);
      expect(
        logs.mock.calls
          .flat()
          .every(
            (entry) =>
              entry === "Database connection failed. Check PostgreSQL health.",
          ),
      ).toBe(true);
    } finally {
      await db.execute(
        sql.raw(
          `drop trigger auth_guard_disconnect on session; drop function ${functionName}()`,
        ),
      );
      logs.mockRestore();
    }
    expect((await login(person.email)).response.status).toBe(200);
  });

  it("expires database sessions and refreshes sessions after a day of use", async () => {
    const person = await register("session-lifetime");
    const expired = await login(person.email);
    await db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(session.userId, person.id));
    expect(
      await (await request("/get-session", undefined, expired.cookie)).json(),
    ).toBeNull();
    const current = await login(person.email);
    const currentSession = await (
      await request("/get-session", undefined, current.cookie)
    ).json();
    const originalExpiry = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await db
      .update(session)
      .set({
        expiresAt: originalExpiry,
        updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      })
      .where(eq(session.id, currentSession.session.id));
    const refreshed = await (
      await request("/get-session", undefined, current.cookie)
    ).json();
    expect(refreshed.user.id).toBe(person.id);
    expect(refreshed.needsRefresh).toBe(true);
    expect(
      (
        await db
          .select()
          .from(session)
          .where(eq(session.id, currentSession.session.id))
      )[0].expiresAt.getTime(),
    ).toBe(originalExpiry.getTime());
    const renewal = await request("/get-session", {}, current.cookie);
    expect(renewal.status).toBe(200);
    expect(renewal.headers.get("set-cookie")).toContain("session_token");
    expect(
      (
        await db
          .select()
          .from(session)
          .where(eq(session.id, currentSession.session.id))
      )[0].expiresAt.getTime(),
    ).toBeGreaterThan(originalExpiry.getTime());
  });

  it("blocks workspace API operations until onboarding permissions are implemented", async () => {
    const person = await register("workspace-block");
    const signedIn = await login(person.email);
    for (const [path, body] of [
      [
        "/organization/create",
        { name: "Unreviewed workspace", slug: `blocked-${runId}` },
      ],
      [
        "/organization/invite-member",
        {
          email: "outsider@example.com",
          role: "owner",
          organizationId: "anything",
        },
      ],
      ["/organization/list", undefined],
    ] as const) {
      expect((await request(path, body, signedIn.cookie)).status).toBe(403);
    }
    expect(
      await db
        .select()
        .from(organization)
        .where(eq(organization.slug, `blocked-${runId}`)),
    ).toHaveLength(0);
  });

  it("enforces the unique workspace membership constraint in PostgreSQL", async () => {
    const person = await register("membership-constraint");
    const workspaceId = randomUUID();
    await db.insert(organization).values({
      id: workspaceId,
      name: "Fixture workspace",
      slug: `fixture-${runId}`,
      createdAt: new Date(),
    });
    try {
      await db.insert(member).values({
        id: randomUUID(),
        organizationId: workspaceId,
        userId: person.id,
        role: "owner",
        createdAt: new Date(),
      });
      await expect(
        db.insert(member).values({
          id: randomUUID(),
          organizationId: workspaceId,
          userId: person.id,
          role: "member",
          createdAt: new Date(),
        }),
      ).rejects.toThrow();
      expect(
        await db
          .select()
          .from(member)
          .where(
            and(
              eq(member.organizationId, workspaceId),
              eq(member.userId, person.id),
            ),
          ),
      ).toHaveLength(1);
    } finally {
      await db.delete(organization).where(eq(organization.id, workspaceId));
    }
  });

  it("enforces auth request throttling even in local development", async () => {
    const ip = newAddress();
    const responses = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      responses.push(
        await request(
          "/sign-in/email",
          { email: `missing-${runId}@example.com`, password },
          undefined,
          ip,
        ),
      );
    }
    expect(responses.at(-1)!.status).toBe(429);
    expect(responses.at(-1)!.headers.get("x-retry-after")).toBeTruthy();
  });
});
