import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { Pool } from "pg";

const inbox = "http://127.0.0.1:8025";

async function emailLink(request: APIRequestContext, recipient: string, subject: string) {
  let messageId = "";
  await expect.poll(async () => {
    const response = await request.get(`${inbox}/api/v1/search`, {
      params: { query: `to:${recipient}` },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    const message = data.messages.find((entry: { ID: string; Subject: string }) =>
      entry.Subject.toLowerCase().includes(subject));
    messageId = message?.ID ?? "";
    return !!messageId;
  }, { timeout: 15_000 }).toBe(true);

  const response = await request.get(`${inbox}/api/v1/message/${messageId}`);
  expect(response.ok()).toBeTruthy();
  const message = await response.json();
  const link = message.Text.match(/https?:\/\/[^\s<>]+/u)?.[0];
  if (!link) throw new Error("Expected an authentication link in the development email.");
  expect(new URL(link).origin).toBe("http://127.0.0.1:3100");
  return link as string;
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
}

test("account verification, sessions, recovery, and reset replay work end to end", async ({ page, request, browser }) => {
  const email = `browser-${randomUUID()}@example.com`;
  const password = "InitialPassword-123!";
  const newPassword = "ReplacementPassword-456!";

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/u);
  await page.goto("/register");
  await page.getByLabel("Full name", { exact: true }).fill("Browser Developer");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await expect(page).toHaveURL(/\/verify-email$/u);

  await page.goto(await emailLink(request, email, "verify"));
  await expect(page).toHaveURL(/\/login\?verified=true$/u);
  await login(page, email, password);
  await expect(page).toHaveURL(/\/dashboard$/u);
  await expect(page.getByRole("heading", { name: "Welcome, Browser Developer" })).toBeVisible();

  // A second real browser session proves recovery invalidates other devices.
  const otherContext = await browser.newContext();
  try {
    const otherPage = await otherContext.newPage();
    await login(otherPage, email, password);
    await expect(otherPage).toHaveURL(/\/dashboard$/u);

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/u);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/u);

    await page.goto("/forgot-password");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toBeVisible();
    await page.goto(await emailLink(request, email, "reset"));
    await expect(page).toHaveURL(/\/reset-password\?token=/u);
    const resetURL = page.url();
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?reset=true$/u);

    await otherPage.goto("http://127.0.0.1:3100/dashboard");
    await expect(otherPage).toHaveURL(/\/login$/u);
    await page.goto(resetURL);
    await page.getByLabel("New password", { exact: true }).fill("ReplayPassword-789!");
    await page.getByLabel("Confirm password", { exact: true }).fill("ReplayPassword-789!");
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Unable to reset" })).toBeVisible();

    await login(page, email, newPassword);
    await expect(page).toHaveURL(/\/dashboard$/u);

    // Age the real session and browser cookie to catch refreshes lost during server rendering.
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const oldExpiry = Date.now() + 2 * 24 * 60 * 60 * 1000;
    try {
      await pool.query(
        'UPDATE session SET expires_at = $1, updated_at = $2 WHERE user_id IN (SELECT id FROM "user" WHERE email = $3)',
        [new Date(oldExpiry), new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), email],
      );
    } finally {
      await pool.end();
    }
    const cookie = (await page.context().cookies()).find((entry) => entry.name.endsWith("session_token"));
    if (!cookie) throw new Error("Expected a real browser session cookie after login.");
    await page.context().addCookies([{ ...cookie, expires: oldExpiry / 1000 }]);
    const renewal = page.waitForResponse((response) =>
      response.url().includes("/api/auth/get-session") && response.request().method() === "POST");
    await page.reload();
    expect((await renewal).ok()).toBeTruthy();
    await expect.poll(async () =>
      (await page.context().cookies()).find((entry) => entry.name.endsWith("session_token"))?.expires ?? 0,
    ).toBeGreaterThan((Date.now() + 6 * 24 * 60 * 60 * 1000) / 1000);
  } finally {
    await otherContext.close();
  }
});

test("invalid recovery links fail clearly", async ({ page }) => {
  await page.goto("/reset-password?error=INVALID_TOKEN");
  await expect(page.getByRole("link", { name: /new reset link/iu })).toBeVisible();
});
