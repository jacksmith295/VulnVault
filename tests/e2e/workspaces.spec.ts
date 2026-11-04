import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { verifiedAccount, login } from "./helpers";

const origin = "http://127.0.0.1:3100";

async function createWorkspace(page: Page, name: string, slug: string) {
  await page.goto("/workspaces/new");
  await page.getByLabel("Workspace name", { exact: true }).fill(name);
  await page.getByLabel("URL slug", { exact: true }).fill(slug);
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/w/${slug}`);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function openSelector(page: Page) {
  const details = page.locator("header details");
  if (await details.getAttribute("open") === null) await details.locator("summary").click();
  return details;
}

test("workspace creation, persistent selector, default navigation, and independent tabs", async ({ page, context }) => {
  const person = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const prefix = `browser-${randomUUID()}`;
  const first = `${prefix}-first`;
  const second = `${prefix}-second`;
  try {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(`${origin}/dashboard`);
    await createWorkspace(page, "Solo Projects", first);
    await expect(page.getByText("Your role: owner", { exact: true })).toBeVisible();
    await expect(page.locator("header")).toBeVisible();
    let selector = await openSelector(page);
    await expect(selector.getByRole("link", { name: "All workspaces", exact: true })).toBeVisible();
    await selector.getByRole("link", { name: "Create workspace +", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/workspaces/new`);
    await createWorkspace(page, "Team Projects", second);

    selector = await openSelector(page);
    await selector.getByRole("link", { name: "Solo Projects", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/w/${first}`);
    const firstId = (await pool.query('SELECT id FROM organization WHERE slug = $1', [first])).rows[0].id;
    await expect.poll(async () => decodeURIComponent(
      (await context.cookies()).find((cookie) => cookie.name === "vv-workspace")?.value ?? "",
    )).toContain(firstId);
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/login`);
    await login(page, person.email, person.password);
    await expect(page).toHaveURL(`${origin}/w/${first}`);

    const otherTab = await context.newPage();
    await otherTab.goto(`${origin}/w/${second}`);
    await expect(otherTab.getByRole("heading", { name: "Team Projects", exact: true })).toBeVisible();
    await expect(page).toHaveURL(`${origin}/w/${first}`);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Solo Projects", exact: true })).toBeVisible();
    await otherTab.close();

    selector = await openSelector(page);
    await selector.getByRole("link", { name: "All workspaces", exact: true }).click();
    await expect(page.getByRole("heading", { name: "All workspaces", exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: /Solo Projects/ })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: /Team Projects/ })).toBeVisible();

    await page.goto("/workspaces/new");
    await page.getByLabel("Workspace name", { exact: true }).fill("Duplicate name");
    await page.getByLabel("URL slug", { exact: true }).fill(first);
    await page.getByRole("button", { name: "Create workspace", exact: true }).click();
    await expect(page.getByText(/already|taken|in use/iu).first()).toBeVisible();
    await expect(page.getByLabel("Workspace name", { exact: true })).toHaveValue("Duplicate name");

    await page.goto(`/w/${first}`);
    await expect.poll(async () => decodeURIComponent(
      (await context.cookies()).find((cookie) => cookie.name === "vv-workspace")?.value ?? "",
    )).toContain(firstId);
    await pool.query('DELETE FROM member WHERE user_id = $1 AND organization_id = $2', [person.id, firstId]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(`${origin}/w/${second}`);
  } finally {
    await pool.query('DELETE FROM organization WHERE slug IN ($1, $2)', [first, second]);
    await pool.query('DELETE FROM "user" WHERE id = $1', [person.id]);
    await pool.end();
  }
});

test("nonmembers and revoked memberships cannot access workspace data", async ({ page, context, browser }) => {
  const person = await verifiedAccount(context);
  const outsiderContext = await browser.newContext();
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const slug = `private-${randomUUID()}`;
  let outsiderId: string | undefined;
  try {
    await createWorkspace(page, "Private Workspace", slug);
    outsiderId = (await verifiedAccount(outsiderContext)).id;
    const outsiderPage = await outsiderContext.newPage();
    await outsiderPage.goto(`${origin}/w/${slug}`);
    await expect(outsiderPage.getByText("404", { exact: true })).toBeVisible();
    await expect(outsiderPage.getByRole("heading", { name: "Private Workspace", exact: true })).toHaveCount(0);

    // Remove only the test fixture membership while keeping its real browser session alive.
    await pool.query('DELETE FROM member WHERE user_id = $1 AND organization_id IN (SELECT id FROM organization WHERE slug = $2)', [person.id, slug]);
    await page.reload();
    await expect(page.getByText("404", { exact: true })).toBeVisible();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(`${origin}/dashboard`);
    await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
    await expect(page.locator("header").getByText("Private Workspace", { exact: true })).toHaveCount(0);
  } finally {
    await outsiderContext.close();
    await pool.query('DELETE FROM organization WHERE slug = $1', [slug]);
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[person.id, outsiderId].filter(Boolean)]);
    await pool.end();
  }
});
