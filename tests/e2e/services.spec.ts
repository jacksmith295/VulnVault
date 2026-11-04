import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { chooseTheme, origin, verifiedAccount } from "./helpers";

async function workspaceFixture(pool: Pool, userId: string) {
  const id = randomUUID();
  const slug = `services-${randomUUID()}`;
  await pool.query('INSERT INTO organization (id, name, slug, created_at) VALUES ($1, $2, $3, now())', [id, "Services workspace", slug]);
  await pool.query('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ($1, $2, $3, $4, now())', [randomUUID(), id, userId, "owner"]);
  return { id, slug, path: `/w/${slug}` };
}

async function createService(page: Page, path: string) {
  await page.goto(`${path}/services/new`);
  await page.getByLabel("Name", { exact: true }).fill("API Service");
  await page.getByLabel("Description", { exact: true }).fill("The API and its worker");
  await page.getByLabel("Repository URLs", { exact: true }).fill("https://GIT.example.com/Team/API.git/\nhttp://git.internal:8080/Team/Worker");
  await page.getByRole("button", { name: "Create service", exact: true }).click();
  await expect(page.getByRole("heading", { name: "API Service", exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${path}/services/[^/]+$`, "u"));
  return page.url();
}

test("service create, atomic edit, stale form recovery, archive and restore", async ({ page, context }) => {
  const person = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const workspace = await workspaceFixture(pool, person.id);
  try {
    const serviceURL = await createService(page, workspace.path);
    await expect(page.locator('a[href="https://git.example.com/Team/API.git"]')).toBeVisible();
    await expect(page.locator('a[href="http://git.internal:8080/Team/Worker"]')).toBeVisible();
    await page.goto(`${serviceURL}/edit`);
    await page.getByLabel("Description", { exact: true }).fill("Theme-safe unsaved draft");
    await chooseTheme(page, "Dark");
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Theme-safe unsaved draft");
    await chooseTheme(page, "Light");
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Theme-safe unsaved draft");
    await page.getByLabel("Description", { exact: true }).fill("The API and its worker");
    await page.getByLabel("Repository URLs", { exact: true }).fill("https://git.example.com/Team/API.git\nhttps://code.example.com/Team/Frontend");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page).toHaveURL(serviceURL);
    await expect(page.locator('a[href="https://code.example.com/Team/Frontend"]')).toBeVisible();
    await expect(page.locator('a[href="http://git.internal:8080/Team/Worker"]')).toHaveCount(0);

    const staleTab = await context.newPage();
    let releasePreference!: () => void;
    const preferenceGate = new Promise<void>((resolve) => { releasePreference = resolve; });
    let preferenceHeld = false;
    let preferencePayload = "";
    try {
      // Hold the initial preference action before execution, then let it refresh this dirty form.
      await staleTab.route("**/*", async (route) => {
        if (!preferenceHeld && route.request().method() === "POST" && route.request().headers()["next-action"]) {
          preferenceHeld = true;
          await preferenceGate;
          const response = await route.fetch();
          preferencePayload = await response.text();
          await route.fulfill({ response, body: preferencePayload });
          return;
        }
        await route.continue();
      });
      await staleTab.goto(`${serviceURL}/edit`);
      await expect.poll(() => preferenceHeld).toBe(true);
      await staleTab.getByLabel("Description", { exact: true }).fill("Stale unsaved description");
      await page.goto(`${serviceURL}/edit`);
      await page.getByLabel("Name", { exact: true }).fill("Renamed API");
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(page).toHaveURL(serviceURL);
      const preferenceResponse = staleTab.waitForResponse((response) =>
        response.request().method() === "POST" && !!response.request().headers()["next-action"]);
      releasePreference();
      const refresh = await preferenceResponse;
      expect(refresh.ok()).toBeTruthy();
      expect(preferencePayload).toContain("Renamed API");
      await refresh.finished();
      await staleTab.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(staleTab.getByLabel("Description", { exact: true })).toHaveValue("Stale unsaved description");
      await staleTab.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(staleTab.getByRole("alert").filter({ hasText: /changed|reload|another/iu })).toBeVisible();
      await expect(staleTab.getByLabel("Description", { exact: true })).toHaveValue("Stale unsaved description");
      await page.reload();
      await expect(page.getByText("The API and its worker", { exact: true })).toBeVisible();
    } finally {
      releasePreference();
      await staleTab.close();
    }

    await page.getByRole("checkbox", { name: "I understand this service will leave the active list." }).check();
    await page.getByRole("button", { name: "Archive service", exact: true }).click();
    await expect(page.getByRole("button", { name: "Restore service", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit service", exact: true })).toHaveCount(0);
    await page.goto(workspace.path);
    await expect(page.getByRole("link", { name: "Renamed API", exact: true })).toHaveCount(0);
    await page.goto(`${workspace.path}?status=archived`);
    await page.getByRole("link", { name: "Renamed API", exact: true }).click();
    await page.getByRole("checkbox", { name: "I want to restore this service to the active list." }).check();
    await page.getByRole("button", { name: "Restore service", exact: true }).click();
    await expect(page.getByRole("link", { name: "Edit service", exact: true })).toBeVisible();
    await page.goto(workspace.path);
    await expect(page.getByRole("link", { name: "Renamed API", exact: true })).toBeVisible();
  } finally {
    await pool.query('DELETE FROM service WHERE workspace_id = $1', [workspace.id]);
    await pool.query('DELETE FROM organization WHERE id = $1', [workspace.id]);
    await pool.query('DELETE FROM "user" WHERE id = $1', [person.id]);
    await pool.end();
  }
});

test("members have read-only service access and forged workspace paths reveal no service", async ({ page, context, browser }) => {
  const owner = await verifiedAccount(context);
  const memberContext = await browser.newContext();
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const workspace = await workspaceFixture(pool, owner.id);
  let memberId: string | undefined;
  let otherWorkspace: Awaited<ReturnType<typeof workspaceFixture>> | undefined;
  try {
    const serviceURL = await createService(page, workspace.path);
    memberId = (await verifiedAccount(memberContext)).id;
    await pool.query('INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ($1, $2, $3, $4, now())', [randomUUID(), workspace.id, memberId, "member"]);
    const memberPage = await memberContext.newPage();
    await memberPage.goto(serviceURL);
    await expect(memberPage.getByRole("heading", { name: "API Service", exact: true })).toBeVisible();
    await expect(memberPage.getByRole("link", { name: "Edit service", exact: true })).toHaveCount(0);
    await expect(memberPage.getByRole("button", { name: "Archive service", exact: true })).toHaveCount(0);
    for (const url of [`${serviceURL}/edit`, `${origin}${workspace.path}/services/new`]) {
      await memberPage.goto(url);
      await expect(memberPage.getByText("404", { exact: true })).toBeVisible();
    }
    otherWorkspace = await workspaceFixture(pool, owner.id);
    const serviceId = new URL(serviceURL).pathname.split("/").at(-1);
    await page.goto(`${otherWorkspace.path}/services/${serviceId}`);
    await expect(page.getByText("404", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "API Service", exact: true })).toHaveCount(0);
  } finally {
    await memberContext.close();
    await pool.query('DELETE FROM service WHERE workspace_id = $1', [workspace.id]);
    await pool.query('DELETE FROM organization WHERE id = ANY($1::text[])', [[workspace.id, otherWorkspace?.id].filter(Boolean)]);
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[owner.id, memberId].filter(Boolean)]);
    await pool.end();
  }
});
