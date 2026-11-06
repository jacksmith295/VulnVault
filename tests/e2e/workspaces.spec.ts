import { test } from "./fixtures";
import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
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
  const trigger = page.getByRole("button", { name: "Switch workspace", exact: true });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  return page.getByRole("menu");
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
    await expect(page.getByRole("link", { name: "Services", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Groups", exact: true })).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();
    let selector = await openSelector(page);
    await page.keyboard.press("ArrowDown");
    await expect(selector).toBeVisible();
    const outside = await page.getByRole("heading", { name: "Solo Projects", exact: true }).boundingBox();
    if (!outside) throw new Error("Expected a visible workspace heading.");
    await page.mouse.click(outside.x + outside.width * 0.9, outside.y + outside.height / 2);
    await expect(selector).not.toBeVisible();
    const workspaceTrigger = page.getByRole("button", { name: "Switch workspace", exact: true });
    await workspaceTrigger.focus();
    await workspaceTrigger.press("ArrowDown");
    selector = page.getByRole("menu");
    await expect(selector.getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(selector).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Switch workspace", exact: true })).toBeFocused();
    selector = await openSelector(page);
    await expect(selector.getByRole("menuitem", { name: "All workspaces", exact: true })).toBeVisible();
    await selector.getByRole("menuitem", { name: "Create workspace +", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/workspaces/new`);
    await createWorkspace(page, "Team Projects", second);

    await page.setViewportSize({ width: 375, height: 812 });
    selector = await openSelector(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const popup = await selector.boundingBox();
    expect(popup).not.toBeNull();
    expect(popup!.x).toBeGreaterThanOrEqual(0);
    expect(popup!.x + popup!.width).toBeLessThanOrEqual(375);
    await selector.getByRole("menuitem", { name: "Solo Projects", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/w/${first}`);
    await page.setViewportSize({ width: 1280, height: 720 });
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
    await selector.getByRole("menuitem", { name: "All workspaces", exact: true }).click();
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
    await expect(page.getByRole("banner").getByText("Private Workspace", { exact: true })).toHaveCount(0);
  } finally {
    await outsiderContext.close();
    await pool.query('DELETE FROM organization WHERE slug = $1', [slug]);
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[person.id, outsiderId].filter(Boolean)]);
    await pool.end();
  }
});
