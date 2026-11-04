import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createEmailVerificationToken } from "better-auth/api";

const sentEmails = vi.hoisted(() => [] as { to: string; subject: string; text: string }[]);
vi.mock("@/lib/server/email", () => ({
  sendAuthEmail: vi.fn(async (to: string, subject: string, text: string) => {
    sentEmails.push({ to, subject, text });
  }),
}));

import { auth } from "@/lib/auth";
import { db, pool } from "@/db";
import { account, member, organization, session, user, verification } from "@/db/schema";

const runId = randomUUID();
const password = "correct-horse-battery-staple";
let addressCounter = 0;
const addressPrefix = `${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;

function newAddress() {
  return `198.${addressPrefix}.${++addressCounter}`;
}

async function request(path: string, body?: Record<string, unknown>, cookie?: string, ip = newAddress()) {
  const headers = new Headers({ origin: "http://localhost:3000", "x-forwarded-for": ip });
  if (body) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  return auth.handler(new Request(`http://localhost:3000/api/auth${path}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }));
}

function emailLink(email: string, subject: string) {
  const message = sentEmails.findLast((item) => item.to === email && item.subject.includes(subject));
  if (!message) throw new Error("Expected auth email was not dispatched");
  return new URL(message.text.match(/https?:\/\/[^\s]+/)![0]);
}

async function register(label: string, verify = true) {
  const email = `${label}-${runId}@example.com`;
  const response = await request("/sign-up/email", { name: "Test Developer", email, password, callbackURL: "/login?verified=true" });
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie") ?? "").not.toContain("session_token");
  const result = await response.json();
  if (verify) {
    const link = emailLink(email, "Verify");
    const verified = await auth.handler(new Request(link));
    expect(verified.status).toBe(302);
    expect(verified.headers.get("set-cookie") ?? "").not.toContain("session_token");
  }
  return { email, id: result.user.id as string };
}

async function login(email: string, suppliedPassword = password) {
  const response = await request("/sign-in/email", { email, password: suppliedPassword });
  const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  return { response, cookie };
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

afterAll(async () => {
  const users = await db.select({ id: user.id }).from(user).where(like(user.email, `%${runId}@example.com`));
  if (users.length) {
    await db.delete(verification).where(inArray(verification.value, users.map((item) => item.id)));
    await db.delete(user).where(inArray(user.id, users.map((item) => item.id)));
  }
  await pool.end();
});

describe("real authentication and persistence", () => {
  it("requires verification and creates neither a session nor a workspace on registration", async () => {
    const person = await register("unverified", false);
    expect((await login(person.email)).response.status).toBe(403);
    expect(await db.select().from(session).where(eq(session.userId, person.id))).toHaveLength(0);
    expect(await db.select().from(member).where(eq(member.userId, person.id))).toHaveLength(0);
    const credentials = await db.select().from(account).where(eq(account.userId, person.id));
    expect(credentials[0].password).toBeTruthy();
    expect(credentials[0].password).not.toBe(password);
  });

  it("supports verified sign-in, returns no session to signed-out callers, and revokes logout", async () => {
    const person = await register("login");
    expect(await (await request("/get-session")).json()).toBeNull();
    const signedIn = await login(person.email);
    expect(signedIn.response.status).toBe(200);
    expect(signedIn.cookie).toContain("session_token");
    const current = await (await request("/get-session", undefined, signedIn.cookie)).json();
    expect(current.user.id).toBe(person.id);
    const stored = await db.select().from(session).where(eq(session.userId, person.id));
    expect(stored[0].expiresAt.getTime() - Date.now()).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect((await request("/sign-out", {}, signedIn.cookie)).status).toBe(200);
    expect(await (await request("/get-session", undefined, signedIn.cookie)).json()).toBeNull();
  });

  it("rejects wrong credentials, invalid names, and short passwords on the server", async () => {
    const person = await register("bad-password");
    expect((await login(person.email, "wrong-password")).response.status).toBe(401);
    const short = await request("/sign-up/email", { name: "Valid Name", email: `short-${runId}@example.com`, password: "short" });
    expect(short.status).toBe(400);
    const invalidName = await request("/sign-up/email", { name: "  ", email: `name-${runId}@example.com`, password });
    expect(invalidName.status).toBe(400);
  });

  it("does not accept an expired verification link", async () => {
    const person = await register("expired-verification", false);
    const token = await createEmailVerificationToken(process.env.BETTER_AUTH_SECRET!, person.email, undefined, -60, { userId: person.id });
    const response = await request(`/verify-email?token=${encodeURIComponent(token)}&callbackURL=/login`);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("error=");
    expect((await db.select().from(user).where(eq(user.id, person.id)))[0].emailVerified).toBe(false);
  });

  it("resends verification and rejects callback URLs outside the trusted origin", async () => {
    const person = await register("resend", false);
    const count = sentEmails.filter((item) => item.to === person.email).length;
    const resent = await request("/send-verification-email", { email: person.email, callbackURL: "/login?verified=true" });
    expect(resent.status).toBe(200);
    expect(sentEmails.filter((item) => item.to === person.email)).toHaveLength(count + 1);
    const rejected = await request("/request-password-reset", { email: person.email, redirectTo: "https://attacker.example/reset" });
    expect(rejected.status).toBe(403);
  });

  it("makes password reset single-use and invalidates all existing sessions", async () => {
    const person = await register("reset");
    const first = await login(person.email);
    const second = await login(person.email);
    expect((await request("/request-password-reset", { email: person.email, redirectTo: "http://localhost:3000/reset-password" })).status).toBe(200);
    const link = emailLink(person.email, "Reset");
    const token = link.pathname.split("/").at(-1)!;
    const changed = await request("/reset-password", { token, newPassword: "new-correct-horse-battery" });
    expect(changed.status).toBe(200);
    expect(await db.select().from(session).where(eq(session.userId, person.id))).toHaveLength(0);
    for (const cookie of [first.cookie, second.cookie]) {
      expect(await (await request("/get-session", undefined, cookie)).json()).toBeNull();
    }
    expect((await request("/reset-password", { token, newPassword: "another-new-password" })).status).toBe(400);
    expect((await login(person.email)).response.status).toBe(401);
    expect((await login(person.email, "new-correct-horse-battery")).response.status).toBe(200);
  });

  it("rejects expired reset credentials and keeps unknown-email reset responses generic", async () => {
    const person = await register("expired-reset");
    const existing = await request("/request-password-reset", { email: person.email });
    const absent = await request("/request-password-reset", { email: `absent-${runId}@example.com` });
    expect(await absent.json()).toEqual(await existing.json());
    const token = emailLink(person.email, "Reset").pathname.split("/").at(-1)!;
    await db.update(verification).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(verification.value, person.id));
    expect((await request("/reset-password", { token, newPassword: "new-correct-horse-battery" })).status).toBe(400);
  });

  it("expires database sessions and refreshes sessions after a day of use", async () => {
    const person = await register("session-lifetime");
    const expired = await login(person.email);
    await db.update(session).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(session.userId, person.id));
    expect(await (await request("/get-session", undefined, expired.cookie)).json()).toBeNull();
    const current = await login(person.email);
    const originalExpiry = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await db.update(session).set({ expiresAt: originalExpiry, updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) }).where(eq(session.userId, person.id));
    const refreshed = await (await request("/get-session", undefined, current.cookie)).json();
    expect(refreshed.user.id).toBe(person.id);
    expect((await db.select().from(session).where(eq(session.userId, person.id)))[0].expiresAt.getTime()).toBeGreaterThan(originalExpiry.getTime());
  });

  it("blocks workspace API operations until onboarding permissions are implemented", async () => {
    const person = await register("workspace-block");
    const signedIn = await login(person.email);
    for (const [path, body] of [
      ["/organization/create", { name: "Unreviewed workspace", slug: `blocked-${runId}` }],
      ["/organization/invite-member", { email: "outsider@example.com", role: "owner", organizationId: "anything" }],
      ["/organization/list", undefined],
    ] as const) {
      expect((await request(path, body, signedIn.cookie)).status).toBe(403);
    }
    expect(await db.select().from(organization).where(eq(organization.slug, `blocked-${runId}`))).toHaveLength(0);
  });

  it("enforces the unique workspace membership constraint in PostgreSQL", async () => {
    const person = await register("membership-constraint");
    const workspaceId = randomUUID();
    await db.insert(organization).values({ id: workspaceId, name: "Fixture workspace", slug: `fixture-${runId}`, createdAt: new Date() });
    try {
      await db.insert(member).values({ id: randomUUID(), organizationId: workspaceId, userId: person.id, role: "owner", createdAt: new Date() });
      await expect(db.insert(member).values({ id: randomUUID(), organizationId: workspaceId, userId: person.id, role: "member", createdAt: new Date() })).rejects.toThrow();
      expect(await db.select().from(member).where(and(eq(member.organizationId, workspaceId), eq(member.userId, person.id)))).toHaveLength(1);
    } finally {
      await db.delete(organization).where(eq(organization.id, workspaceId));
    }
  });

  it("enforces auth request throttling even in local development", async () => {
    const ip = newAddress();
    const responses = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      responses.push(await request("/sign-in/email", { email: `missing-${runId}@example.com`, password }, undefined, ip));
    }
    expect(responses.at(-1)!.status).toBe(429);
    expect(responses.at(-1)!.headers.get("x-retry-after")).toBeTruthy();
  });
});
