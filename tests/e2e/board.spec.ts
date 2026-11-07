import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { test } from "./fixtures";
import {
  chooseTheme,
  origin,
  refreshServerProps,
  verifiedAccount,
} from "./helpers";

async function workspaceFixture(page: Page, pool: Pool) {
  const slug = `board-${randomUUID()}`;
  await page.goto("/workspaces/new");
  await page
    .getByLabel("Workspace name", { exact: true })
    .fill("Board workspace");
  await page.getByLabel("URL slug", { exact: true }).fill(slug);
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(page).toHaveURL(`${origin}/w/${slug}`);
  const id = (
    await pool.query("SELECT id FROM organization WHERE slug = $1", [slug])
  ).rows[0].id as string;
  const primary = randomUUID(),
    secondary = randomUUID(),
    archived = randomUUID();
  await pool.query(
    "INSERT INTO service (id,workspace_id,name,archived_at) VALUES ($1,$4,'Payments API',NULL),($2,$4,'Public API',NULL),($3,$4,'Retired API',now())",
    [primary, secondary, archived, id],
  );
  return {
    id,
    slug,
    primary,
    secondary,
    archived,
    path: `/w/${slug}`,
  };
}

async function finding(
  pool: Pool,
  serviceId: string,
  title: string,
  status = "new",
  second = 0,
  severity = "high",
) {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO finding (id,service_id,title,description,severity,status,remediation_notes,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      id,
      serviceId,
      title,
      "Keep this description",
      severity,
      status,
      "Keep these notes",
      new Date(Date.UTC(2026, 0, 1, 0, 0, second)),
    ],
  );
  return id;
}

async function cleanup(
  pool: Pool,
  fixture: Awaited<ReturnType<typeof workspaceFixture>>,
  userIds: (string | undefined)[],
) {
  // Only isolated test fixtures are deleted; the application offers no finding deletion.
  await pool.query(
    "DELETE FROM finding WHERE service_id IN (SELECT id FROM service WHERE workspace_id = $1)",
    [fixture.id],
  );
  await pool.query("DELETE FROM service WHERE workspace_id = $1", [fixture.id]);
  await pool.query("DELETE FROM organization WHERE id = $1", [fixture.id]);
  await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [
    userIds.filter(Boolean),
  ]);
  await pool.end();
}

function column(page: Page, label: string) {
  return page.getByRole("region", { name: `${label} findings`, exact: true });
}

async function selectFilter(page: Page, label: string, value: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: value, exact: true }).click();
}

async function applyFilters(page: Page) {
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
}

async function changeStatus(page: Page, title: string, status: string) {
  await page
    .getByRole("button", { name: `Change status for ${title}`, exact: true })
    .click();
  await page.getByRole("menuitem", { name: status, exact: true }).click();
}

test("board loads bounded columns, filters by URL, changes status and adapts to mobile themes", async ({
  page,
  context,
}) => {
  const owner = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const fixture = await workspaceFixture(page, pool);
  try {
    let targetId = "";
    for (let number = 1; number <= 22; number++) {
      targetId = await finding(
        pool,
        fixture.primary,
        `New finding ${String(number).padStart(2, "0")}`,
        "new",
        number,
      );
    }
    const referenceId = randomUUID();
    await pool.query(
      "INSERT INTO finding_reference (id,finding_id,url) VALUES ($1,$2,$3)",
      [referenceId, targetId, "https://advisories.example.com/payment"],
    );
    await finding(pool, fixture.secondary, "Triaged finding", "triaged");
    for (const status of [
      "in_progress",
      "resolved",
      "rejected",
      "accepted_risk",
    ]) {
      await finding(pool, fixture.primary, `${status} finding`, status);
    }
    await finding(pool, fixture.archived, "Archived finding");
    await page.goto(`/w/${fixture.slug}`);
    await expect(
      page.getByRole("link", { name: "Services", exact: true }),
    ).toHaveAttribute("href", `/w/${fixture.slug}/services`);
    await expect(
      page.getByRole("link", { name: "Groups", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(`${origin}${fixture.path}`);
    await expect(
      column(page, "New").getByRole("heading", {
        name: "New (22)",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      column(page, "New").getByRole("link", { name: /^New finding /u }),
    ).toHaveCount(20);
    await expect(
      page.getByRole("link", { name: "New finding 01", exact: true }),
    ).toHaveCount(0);
    const newCards = page.getByRole("group", {
      name: "New findings cards",
      exact: true,
    });
    await newCards.focus();
    await newCards.press("PageDown");
    await expect
      .poll(() => newCards.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await column(page, "New")
      .getByRole("button", { name: "Load more New findings", exact: true })
      .click();
    await expect(
      column(page, "New").getByRole("link", { name: /^New finding /u }),
    ).toHaveCount(22);
    await expect(
      page.getByRole("link", { name: "Archived finding", exact: true }),
    ).toHaveCount(0);
    await changeStatus(page, "New finding 22", "Resolved");
    await expect(
      column(page, "Resolved").getByRole("link", {
        name: "New finding 22",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      column(page, "New").getByRole("heading", {
        name: "New (21)",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      column(page, "Resolved").getByRole("heading", {
        name: "Resolved (2)",
        exact: true,
      }),
    ).toBeVisible();
    const saved = (
      await pool.query(
        "SELECT status,resolved_at,description,remediation_notes FROM finding WHERE id = $1",
        [targetId],
      )
    ).rows[0];
    expect(saved).toMatchObject({
      status: "resolved",
      description: "Keep this description",
      remediation_notes: "Keep these notes",
    });
    expect(saved.resolved_at).not.toBeNull();
    expect(
      (
        await pool.query(
          "SELECT id,url FROM finding_reference WHERE finding_id = $1",
          [targetId],
        )
      ).rows,
    ).toEqual([
      { id: referenceId, url: "https://advisories.example.com/payment" },
    ]);

    // Desktop panels other than the selected mobile tab must remain interactive.
    await changeStatus(page, "resolved finding", "Triaged");
    await expect(
      column(page, "Triaged").getByRole("link", {
        name: "resolved finding",
        exact: true,
      }),
    ).toBeVisible();
    await changeStatus(page, "resolved finding", "Resolved");
    await expect(
      column(page, "Resolved").getByRole("link", {
        name: "resolved finding",
        exact: true,
      }),
    ).toBeVisible();

    await selectFilter(page, "Service", "Public API");
    await applyFilters(page);
    await expect(page).toHaveURL(
      new RegExp(`service=${fixture.secondary}`, "u"),
    );
    await expect(
      column(page, "New").getByRole("heading", {
        name: "New (0)",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      column(page, "Triaged").getByRole("link", {
        name: "Triaged finding",
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("combobox", { name: "Service", exact: true }),
    ).toContainText("Public API");
    await page
      .getByRole("link", { name: "Clear filters", exact: true })
      .click();
    await selectFilter(page, "Status", "Resolved");
    await applyFilters(page);
    await expect(
      column(page, "Resolved").getByRole("heading", {
        name: "Resolved (2)",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      column(page, "New").getByRole("heading", {
        name: "New (0)",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Clear filters", exact: true })
      .click();
    await expect(
      column(page, "New").getByRole("heading", {
        name: "New (21)",
        exact: true,
      }),
    ).toBeVisible();
    for (const viewport of [
      { width: 2560, height: 1440 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      const geometry = await page
        .getByTestId("finding-board")
        .evaluate((element) => ({
          width: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }));
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);
      for (const status of [
        "New",
        "Triaged",
        "In progress",
        "Resolved",
        "Rejected",
        "Accepted risk",
      ]) {
        const rectangle = await column(page, status).boundingBox();
        expect(rectangle).not.toBeNull();
        expect(rectangle!.x).toBeGreaterThanOrEqual(0);
        expect(rectangle!.x + rectangle!.width).toBeLessThanOrEqual(
          viewport.width,
        );
      }
    }
    await page.setViewportSize({ width: 2560, height: 1440 });
    await chooseTheme(page, "Light");
    await page.screenshot({
      path: test.info().outputPath("board-desktop-light.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await chooseTheme(page, "Dark");
    await page.screenshot({
      path: test.info().outputPath("board-desktop-dark.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await chooseTheme(page, "Dark");
    await expect(page.getByRole("tab", { name: /^New \(/u })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const newTab = page.getByRole("tab", { name: /^New \(/u });
    await newTab.focus();
    await newTab.press("ArrowRight");
    const triagedTab = page.getByRole("tab", { name: /^Triaged \(/u });
    await expect(triagedTab).toBeFocused();
    await triagedTab.press("Enter");
    await expect(
      page.getByRole("tab", { name: /^Triaged \(/u }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(column(page, "Triaged")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("board-mobile-dark.png"),
      fullPage: true,
    });
    await chooseTheme(page, "Light");
    await page.screenshot({
      path: test.info().outputPath("board-mobile-light.png"),
      fullPage: true,
    });
  } finally {
    await cleanup(pool, fixture, [owner.id]);
  }
});

test("member board hides restricted data and discards loaded cards after group revocation", async ({
  page,
  context,
  browser,
}) => {
  const owner = await verifiedAccount(context);
  const memberContext = await browser.newContext();
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const fixture = await workspaceFixture(page, pool);
  let memberId: string | undefined;
  try {
    const person = await verifiedAccount(memberContext);
    memberId = person.id;
    const membershipId = randomUUID(),
      payments = randomUUID(),
      security = randomUUID();
    await pool.query(
      "INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,'member',now())",
      [membershipId, fixture.id, person.id],
    );
    await pool.query(
      "INSERT INTO workspace_group (id,workspace_id,name) VALUES ($1,$3,'Payments'),($2,$3,'Security')",
      [payments, security, fixture.id],
    );
    await pool.query(
      "INSERT INTO group_membership (workspace_id,group_id,member_id) VALUES ($1,$2,$3)",
      [fixture.id, payments, membershipId],
    );
    await pool.query(
      "INSERT INTO service_access_group (workspace_id,service_id,group_id) VALUES ($1,$2,$3),($1,$4,$5)",
      [fixture.id, fixture.primary, payments, fixture.archived, security],
    );
    const hidden = randomUUID();
    await pool.query(
      "INSERT INTO service (id,workspace_id,name) VALUES ($1,$2,'Hidden API')",
      [hidden, fixture.id],
    );
    await pool.query(
      "INSERT INTO service_access_group (workspace_id,service_id,group_id) VALUES ($1,$2,$3)",
      [fixture.id, hidden, security],
    );
    for (let number = 1; number <= 22; number++)
      await finding(pool, fixture.primary, `Payment ${number}`, "new", number);
    await finding(pool, fixture.secondary, "Public finding");
    await finding(pool, hidden, "Hidden finding");
    const memberPage = await memberContext.newPage();
    await memberPage.goto(`${origin}${fixture.path}`);
    await expect(
      column(memberPage, "New").getByRole("heading", {
        name: "New (23)",
        exact: true,
      }),
    ).toBeVisible();
    await memberPage
      .getByRole("combobox", { name: "Group", exact: true })
      .click();
    await expect(
      memberPage.getByRole("option", { name: "Payments", exact: true }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("option", { name: "Security", exact: true }),
    ).toHaveCount(0);
    await memberPage.keyboard.press("Escape");
    await expect(
      memberPage.getByRole("option", { name: "Payments", exact: true }),
    ).not.toBeVisible();
    await memberPage
      .getByRole("combobox", { name: "Service", exact: true })
      .click();
    await expect(
      memberPage.getByRole("option", { name: "Public API", exact: true }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("option", { name: "Hidden API", exact: true }),
    ).toHaveCount(0);
    await memberPage.keyboard.press("Escape");
    await expect(
      memberPage.getByRole("option", { name: "Public API", exact: true }),
    ).not.toBeVisible();
    await selectFilter(memberPage, "Group", "Everyone");
    await applyFilters(memberPage);
    await expect(
      column(memberPage, "New").getByRole("heading", {
        name: "New (1)",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("link", { name: "Public finding", exact: true }),
    ).toBeVisible();
    await selectFilter(memberPage, "Group", "Payments");
    await applyFilters(memberPage);
    await expect(
      column(memberPage, "New").getByRole("heading", {
        name: "New (22)",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto(`/w/${fixture.slug}/groups/${payments}`);
    await page
      .getByRole("checkbox", {
        name: `Workspace Developer (${person.email})`,
        exact: true,
      })
      .uncheck();
    const save = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        (response.request().headers()["content-type"] ?? "").startsWith(
          "multipart/form-data",
        ),
    );
    await page.getByRole("button", { name: "Save group", exact: true }).click();
    expect((await save).ok()).toBeTruthy();
    await expect(
      page.getByRole("button", { name: "Save group", exact: true }),
    ).toBeEnabled();
    await memberPage
      .getByRole("button", { name: "Load more New findings", exact: true })
      .click();
    await expect(
      memberPage.getByRole("link", { name: /^Payment \d+$/u }),
    ).toHaveCount(0);
    await expect(
      memberPage.getByText(
        "Some filters are invalid or unavailable. Clear the filters and try again.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("searchbox", {
        name: "Search findings",
        exact: true,
      }),
    ).toBeFocused();
    await memberPage.goto(`${origin}${fixture.path}?group=${security}`);
    await expect(
      memberPage.getByText(
        "Some filters are invalid or unavailable. Clear the filters and try again.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("link", { name: "Hidden finding", exact: true }),
    ).toHaveCount(0);
    await expect(
      memberPage.getByRole("link", { name: "Public finding", exact: true }),
    ).toHaveCount(0);
  } finally {
    await memberContext.close();
    await cleanup(pool, fixture, [owner.id, memberId]);
  }
});

test("board rejects stale status edits and keeps archived cards read-only", async ({
  page,
  context,
}) => {
  const owner = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const fixture = await workspaceFixture(page, pool);
  const staleTab = await context.newPage();
  let releasePreference!: () => void;
  const preferenceGate = new Promise<void>((resolve) => {
    releasePreference = resolve;
  });
  let preferenceHeld = false;
  try {
    const id = await finding(pool, fixture.primary, "Stale finding");
    for (let number = 1; number <= 21; number++) {
      await finding(
        pool,
        fixture.primary,
        `Other finding ${number}`,
        "new",
        number,
      );
    }
    await finding(pool, fixture.archived, "Archived finding");
    await page.goto(`${fixture.path}?archive=all`);
    await page
      .getByRole("button", { name: "Load more New findings", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Archived finding", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Change status for Archived finding",
        exact: true,
      }),
    ).toBeDisabled();
    await staleTab.route(`**/w/${fixture.slug}/preference`, async (route) => {
      preferenceHeld = true;
      await preferenceGate;
      await route.continue();
    });
    await staleTab.goto(`${origin}${fixture.path}`);
    await expect.poll(() => preferenceHeld).toBe(true);
    await expect(
      staleTab.getByRole("link", { name: "Stale finding", exact: true }),
    ).toHaveCount(0);
    await staleTab
      .getByRole("button", { name: "Load more New findings", exact: true })
      .click();
    await expect(
      staleTab.getByRole("link", { name: "Stale finding", exact: true }),
    ).toBeVisible();
    const preferenceResponse = staleTab.waitForResponse((response) =>
      response.url().endsWith(`/w/${fixture.slug}/preference`),
    );
    releasePreference();
    expect((await preferenceResponse).status()).toBe(204);
    await expect(
      staleTab.getByRole("link", { name: "Stale finding", exact: true }),
    ).toBeVisible();
    await page.goto(
      `/w/${fixture.slug}/services/${fixture.primary}/findings/${id}/edit`,
    );
    await page.getByRole("combobox", { name: "Status", exact: true }).click();
    await page.getByRole("option", { name: "Triaged", exact: true }).click();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page).toHaveURL(
      `${origin}/w/${fixture.slug}/services/${fixture.primary}/findings/${id}`,
    );
    await changeStatus(staleTab, "Stale finding", "Resolved");
    await expect(
      staleTab.getByRole("alert").filter({ hasText: /changed|reload/iu }),
    ).toBeVisible();
    expect(
      (
        await pool.query(
          "SELECT status,version,resolved_at FROM finding WHERE id = $1",
          [id],
        )
      ).rows[0],
    ).toMatchObject({ status: "triaged", version: 2, resolved_at: null });
    await staleTab
      .getByRole("button", { name: "Refresh board", exact: true })
      .click();
    await expect(
      column(staleTab, "Triaged").getByRole("link", {
        name: "Stale finding",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    releasePreference();
    await staleTab.close();
    await cleanup(pool, fixture, [owner.id]);
  }
});

test("workspace home preserves filters while board results stream", async ({
  page,
  context,
}) => {
  const owner = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const fixture = await workspaceFixture(page, pool);
  const blocker = await pool.connect();
  try {
    await finding(pool, fixture.primary, "Critical work", "new", 1, "critical");
    await finding(pool, fixture.secondary, "High work");
    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.goto(fixture.path);
    await expect(
      page.getByRole("heading", { name: "Board workspace", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Critical work", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Services", exact: true }),
    ).toHaveAttribute("href", `/w/${fixture.slug}/services`);
    const board = page.locator('[data-testid="finding-board"]:visible');
    const before = await board.boundingBox();
    expect(before).not.toBeNull();
    await page.evaluate(() => {
      (
        window as Window & { boardNavigationMarker?: string }
      ).boardNavigationMarker = "same-document";
    });
    const severity = page.getByRole("combobox", {
      name: "Severity",
      exact: true,
    });
    await severity.evaluate((element) => {
      element.setAttribute("data-persistent-filter", "original");
    });
    await selectFilter(page, "Severity", "Critical");
    // Hold the real query, allowing the server Suspense fallback to stream first.
    await blocker.query("BEGIN");
    await blocker.query(
      "SET LOCAL idle_in_transaction_session_timeout = '20s'",
    );
    await blocker.query("LOCK TABLE finding IN ACCESS EXCLUSIVE MODE");
    await applyFilters(page);
    await expect(
      page.getByRole("status", { name: "Loading findings", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("status", { name: "Loading findings", exact: true })
        .locator('[aria-hidden="true"]')
        .first(),
    ).toHaveCSS("animation-name", "pulse");
    await expect(severity).toBeVisible();
    await expect(severity).toHaveAttribute(
      "data-persistent-filter",
      "original",
    );
    await expect(severity).toContainText("Critical");
    const pending = await board.boundingBox();
    expect(pending).not.toBeNull();
    expect(Math.abs(pending!.y - before!.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(pending!.height - before!.height)).toBeLessThanOrEqual(2);
    expect(Math.abs(pending!.width - before!.width)).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: test.info().outputPath("board-loading-2560.png"),
      fullPage: true,
    });
    await selectFilter(page, "Severity", "High");
    await blocker.query("COMMIT");
    await expect(
      page.getByRole("status", { name: "Loading findings", exact: true }),
    ).not.toBeVisible();
    await expect(page).toHaveURL(/severity=critical/u);
    await expect(
      page.getByRole("link", { name: "Critical work", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "High work", exact: true }),
    ).toHaveCount(0);
    await expect(severity).toHaveAttribute(
      "data-persistent-filter",
      "original",
    );
    await expect(severity).toContainText("High");
    const after = await board.boundingBox();
    expect(after).not.toBeNull();
    expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(after!.height - before!.height)).toBeLessThanOrEqual(2);
    expect(
      await page.evaluate(
        () =>
          (window as Window & { boardNavigationMarker?: string })
            .boardNavigationMarker,
      ),
    ).toBe("same-document");

    await blocker.query("BEGIN");
    await blocker.query(
      "SET LOCAL idle_in_transaction_session_timeout = '20s'",
    );
    await blocker.query("LOCK TABLE finding IN ACCESS EXCLUSIVE MODE");
    await page
      .getByRole("link", { name: "Clear filters", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Loading findings", exact: true }),
    ).toBeVisible();
    await expect(severity).toHaveAttribute(
      "data-persistent-filter",
      "original",
    );
    await expect(severity).toContainText("All severities");
    await blocker.query("COMMIT");
    await expect(
      page.getByRole("link", { name: "High work", exact: true }),
    ).toBeVisible();
    await expect(severity).toHaveAttribute(
      "data-persistent-filter",
      "original",
    );
    await page.goBack();
    await expect(page).toHaveURL(/severity=critical/u);
    await expect(severity).toContainText("Critical");
    await expect(
      page.getByRole("link", { name: "High work", exact: true }),
    ).toHaveCount(0);
    await page.goForward();
    await expect(page).toHaveURL(`${origin}${fixture.path}`);
    await expect(severity).toContainText("All severities");
    await expect(
      page.getByRole("link", { name: "High work", exact: true }),
    ).toBeVisible();
    // Clear also removes an unapplied draft when the URL is already unfiltered.
    await selectFilter(page, "Severity", "High");
    const refreshed = await refreshServerProps(page);
    expect(refreshed).toContain("High work");
    await expect(severity).toContainText("High");
    await page
      .getByRole("link", { name: "Clear filters", exact: true })
      .click();
    await expect(severity).toContainText("All severities");

    await page.getByRole("link", { name: "Services", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/w/${fixture.slug}/services`);
    await expect(
      page.getByRole("link", { name: "Payments API", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Board", exact: true }).click();
    await expect(page).toHaveURL(`${origin}${fixture.path}`);
    await page.goto(`/w/${fixture.slug}/findings?severity=critical`);
    await expect(page).toHaveURL(`${origin}${fixture.path}?severity=critical`);
    await expect(
      page.getByRole("link", { name: "Critical work", exact: true }),
    ).toBeVisible();
    await page.goto(`/w/${fixture.slug}/findings?severity=high&severity=low`);
    await expect(page).toHaveURL(
      `${origin}${fixture.path}?severity=high&severity=low`,
    );
    await expect(
      page.getByText(
        "Some filters are invalid or unavailable. Clear the filters and try again.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "High work", exact: true }),
    ).toHaveCount(0);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await cleanup(pool, fixture, [owner.id]);
  }
});

test("mobile filters use a draft-preserving drawer and release focus on desktop resize", async ({
  page,
  context,
}) => {
  const owner = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const fixture = await workspaceFixture(page, pool);
  const blocker = await pool.connect();
  const dialog = page.getByRole("dialog", {
    name: "Finding filters",
    exact: true,
  });
  const trigger = page.getByRole("button", { name: /^Filters \(/u });
  const severity = page.getByRole("combobox", {
    name: "Severity",
    exact: true,
  });
  try {
    await finding(
      pool,
      fixture.primary,
      "Critical mobile work",
      "new",
      1,
      "critical",
    );
    await finding(pool, fixture.secondary, "High mobile work");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(fixture.path);
    await expect(trigger).toHaveText("Filters (0)");
    await expect(severity).toHaveCount(0);
    const board = page.locator('[data-testid="finding-board"]:visible');
    const before = await board.boundingBox();
    expect(before!.y).toBeLessThan(450);
    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("option")).toHaveCount(0);
    await severity.press("ArrowDown");
    await expect(
      page.getByRole("option", { name: "Critical", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("option", { name: "Critical", exact: true }),
    ).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(severity).toBeFocused();
    await severity.press("ArrowDown");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Home");
    await expect(
      page.getByRole("option", { name: "All severities", exact: true }),
    ).toHaveAttribute("data-highlighted", "");
    await page.keyboard.press("ArrowDown");
    await expect(
      page.getByRole("option", { name: "Critical", exact: true }),
    ).toHaveAttribute("data-highlighted", "");
    await page.keyboard.press("Enter");
    await expect(severity).toContainText("Critical");
    await severity.press("Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveText("Filters (0)");
    await chooseTheme(page, "Dark");
    await trigger.click();
    await expect(severity).toContainText("Critical");
    await page.screenshot({
      path: test.info().outputPath("filters-mobile-dark.png"),
      fullPage: true,
    });
    const drawerTitle = page.getByRole("heading", {
      name: "Finding filters",
      exact: true,
    });
    await drawerTitle.hover();
    const titleBounds = (await drawerTitle.boundingBox())!;
    const settledX = (await dialog.boundingBox())!.x;
    await page.mouse.move(titleBounds.x + 10, titleBounds.y + 10);
    await page.mouse.down();
    await page.mouse.move(titleBounds.x + 90, titleBounds.y + 10, { steps: 6 });
    await expect(dialog).toHaveAttribute("data-swiping", "");
    expect(
      await dialog.evaluate(
        (element) => getComputedStyle(element).transitionDuration,
      ),
    ).toBe("0s");
    expect((await dialog.boundingBox())!.x).toBeGreaterThan(settledX + 20);
    await page.mouse.move(titleBounds.x + 10, titleBounds.y + 10, { steps: 6 });
    await page.mouse.up();
    await expect(dialog).toBeVisible();
    await expect
      .poll(async () => (await dialog.boundingBox())!.x)
      .toBeLessThan(settledX + 1);
    await expect(severity).toContainText("Critical");
    await blocker.query("BEGIN");
    await blocker.query(
      "SET LOCAL idle_in_transaction_session_timeout = '20s'",
    );
    await blocker.query("LOCK TABLE finding IN ACCESS EXCLUSIVE MODE");
    await applyFilters(page);
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("status", { name: "Loading findings", exact: true }),
    ).toBeVisible();
    const pending = await board.boundingBox();
    expect(Math.abs(pending!.y - before!.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(pending!.height - before!.height)).toBeLessThanOrEqual(2);
    await blocker.query("COMMIT");
    await expect(page).toHaveURL(/severity=critical/u);
    await expect(trigger).toHaveText("Filters (1)");
    await expect(
      page.getByRole("link", { name: "Critical mobile work", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "High mobile work", exact: true }),
    ).toHaveCount(0);
    await trigger.click();
    await page
      .getByRole("link", { name: "Clear filters", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toHaveText("Filters (0)");
    await expect(
      page.getByRole("link", { name: "High mobile work", exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect(trigger).toHaveText("Filters (1)");
    await trigger.click();
    await expect(severity).toContainText("Critical");
    await selectFilter(page, "Severity", "High");
    await drawerTitle.hover();
    const swipe = (await drawerTitle.boundingBox())!;
    await page.mouse.move(swipe.x + 10, swipe.y + 10);
    await page.mouse.down();
    await page.mouse.move(swipe.x + 250, swipe.y + 10, { steps: 8 });
    await page.mouse.up();
    await expect(dialog).not.toBeVisible();
    await trigger.click();
    await expect(severity).toContainText("High");
    await page.setViewportSize({ width: 1023, height: 900 });
    await expect(dialog).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("searchbox", { name: "Search findings", exact: true }),
    ).toBeFocused();
    await expect(severity).toContainText("High");
    expect(
      await page.evaluate(() => getComputedStyle(document.body).overflow),
    ).not.toBe("hidden");
    await page.setViewportSize({ width: 1023, height: 900 });
    await trigger.click();
    await expect(severity).toContainText("High");
    // The left edge is outside the right-aligned drawer at this width.
    await page.mouse.click(10, 450);
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    for (const width of [320, 390, 768, 1023, 1024, 1279, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      if (width < 1024) await expect(trigger).toBeVisible();
      else await expect(severity).toBeVisible();
      const visibleRegions = page.getByRole("region", {
        name: /^(New|Triaged|In progress|Resolved|Rejected|Accepted risk) findings$/u,
      });
      await expect(visibleRegions).toHaveCount(width >= 1280 ? 6 : 1);
    }
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await cleanup(pool, fixture, [owner.id]);
  }
});

async function motionSamples(
  locator: import("@playwright/test").Locator,
  property: string,
) {
  await expect
    .poll(
      () =>
        locator.evaluate(
          (element, property) =>
            element
              .getAnimations()
              .some(
                (animation) =>
                  animation instanceof CSSTransition &&
                  animation.transitionProperty === property,
              ),
          property,
        ),
      { timeout: 5_000, intervals: [16, 32, 64] },
    )
    .toBe(true);
  return locator.evaluate((element, property) => {
    const animation = element
      .getAnimations()
      .find(
        (item) =>
          item instanceof CSSTransition && item.transitionProperty === property,
      );
    if (!animation?.effect)
      throw new Error(`Expected an actual ${property} transition.`);
    animation.pause();
    const duration = Number(animation.effect.getTiming().duration);
    const sample = () => ({
      x: element.getBoundingClientRect().x,
      width: element.getBoundingClientRect().width,
      opacity: Number(getComputedStyle(element).opacity),
      scale: parseFloat(getComputedStyle(element).scale) || 1,
    });
    animation.currentTime = duration * 0.1;
    const start = sample();
    animation.currentTime = duration * 0.9;
    return { duration, start, end: sample() };
  }, property);
}

async function finishMotion(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (animation.effect?.getTiming().iterations !== Infinity)
        animation.finish();
    }
  });
}

test("overlays animate in and out without delaying reduced-motion interactions", async ({
  page,
  context,
}) => {
  page.setDefaultTimeout(5_000);
  const owner = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const fixture = await workspaceFixture(page, pool);
  const popup = page.locator('[role="dialog"]');
  const trigger = page.getByRole("button", { name: /^Filters \(/u });
  try {
    await finding(pool, fixture.primary, "Motion check");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    // Pause overlay transitions when they start so entry and exit can be sampled deterministically.
    await page.addInitScript(() => {
      document.addEventListener("transitionrun", (event) => {
        const target = event.target;
        if (
          !(target instanceof HTMLElement) ||
          !target.matches(
            '[role="dialog"], [role="menu"], [role="presentation"]',
          )
        )
          return;
        for (const animation of target.getAnimations()) {
          if (
            animation instanceof CSSTransition &&
            ["transform", "opacity", "scale"].includes(
              animation.transitionProperty,
            )
          )
            animation.pause();
        }
      });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(fixture.path);
    await expect(
      page.getByRole("link", { name: "Motion check", exact: true }),
    ).toBeVisible();
    await trigger.click();
    const backdrop = page.locator(
      '[role="presentation"][style*="--drawer-swipe-progress"]',
    );
    const backdropEnter = await motionSamples(backdrop, "opacity");
    expect(backdropEnter.end.opacity).toBeGreaterThan(
      backdropEnter.start.opacity,
    );
    const entering = await motionSamples(popup, "transform");
    expect(entering.duration).toBeGreaterThan(0);
    expect(entering.duration).toBeLessThanOrEqual(300);
    expect(entering.end.x).toBeLessThan(entering.start.x);
    expect(entering.end.width).toBeCloseTo(entering.start.width, 2);
    await finishMotion(page);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(popup).toHaveCount(1);
    const backdropExit = await motionSamples(backdrop, "opacity");
    expect(backdropExit.end.opacity).toBeLessThan(backdropExit.start.opacity);
    const exiting = await motionSamples(popup, "transform");
    expect(exiting.end.x).toBeGreaterThan(exiting.start.x);
    // Reopen during a retained exit to catch stale unmount/focus callbacks.
    await page
      .getByRole("button", { name: /^Filters \(/u, includeHidden: true })
      .evaluate((element) => (element as HTMLButtonElement).click());
    await finishMotion(page);
    await expect(popup).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await finishMotion(page);
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await page.getByRole("button", { name: "Theme", exact: true }).click();
    const menu = page.locator('[role="menu"]');
    const menuFade = await motionSamples(menu, "opacity");
    expect(menuFade.end.opacity).toBeGreaterThan(menuFade.start.opacity);
    const menuScale = await motionSamples(menu, "scale");
    expect(menuScale.end.scale).toBeGreaterThan(menuScale.start.scale);
    await finishMotion(page);
    await page
      .getByRole("button", { name: "Theme", exact: true, includeHidden: true })
      .evaluate((element) => (element as HTMLButtonElement).click());
    const menuExit = await motionSamples(menu, "opacity");
    expect(menuExit.end.opacity).toBeLessThan(menuExit.start.opacity);
    const menuScaleExit = await motionSamples(menu, "scale");
    expect(menuScaleExit.end.scale).toBeLessThan(menuScaleExit.start.scale);
    await finishMotion(page);
    await expect(menu).toHaveCount(0);

    await trigger.click();
    await finishMotion(page);
    await page.getByRole("combobox", { name: "Severity", exact: true }).click();
    const selectPopup = page
      .getByRole("listbox", { includeHidden: true })
      .locator("..");
    const selectFade = await motionSamples(selectPopup, "opacity");
    expect(selectFade.end.opacity).toBeGreaterThan(selectFade.start.opacity);
    const selectScale = await motionSamples(selectPopup, "scale");
    expect(selectScale.end.scale).toBeGreaterThan(selectScale.start.scale);
    await finishMotion(page);
    await page.keyboard.press("Escape");
    const selectExit = await motionSamples(selectPopup, "opacity");
    expect(selectExit.end.opacity).toBeLessThan(selectExit.start.opacity);
    const selectScaleExit = await motionSamples(selectPopup, "scale");
    expect(selectScaleExit.end.scale).toBeLessThan(selectScaleExit.start.scale);
    await finishMotion(page);
    await expect(popup).toBeVisible();
    await page.keyboard.press("Escape");
    await finishMotion(page);
    await expect(popup).toHaveCount(0);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await trigger.click();
    await expect(popup).toBeVisible();
    const reduced = await popup.evaluate((element) => ({
      transform: getComputedStyle(element).transform,
      opacity: Number(getComputedStyle(element).opacity),
      animations: element
        .getAnimations()
        .filter(
          (animation) => Number(animation.effect?.getTiming().duration) > 1,
        ).length,
    }));
    expect(reduced.opacity).toBe(1);
    expect(reduced.animations).toBe(0);
    expect(
      reduced.transform === "none" ||
        reduced.transform === "matrix(1, 0, 0, 1, 0, 0)",
    ).toBe(true);
    await page.getByRole("combobox", { name: "Severity", exact: true }).click();
    await expect(
      page.getByRole("option", { name: "Critical", exact: true }),
    ).toBeVisible();
    expect(
      await selectPopup.evaluate(
        (element) =>
          element
            .getAnimations()
            .filter(
              (animation) => Number(animation.effect?.getTiming().duration) > 1,
            ).length,
      ),
    ).toBe(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
  } finally {
    await cleanup(pool, fixture, [owner.id]);
  }
});

test("board pagination retains rows after transient failures and completes without losing focus", async ({
  page,
  context,
}) => {
  const owner = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const fixture = await workspaceFixture(page, pool);
  try {
    for (let number = 1; number <= 22; number++) {
      await finding(
        pool,
        fixture.primary,
        `Paging New ${number}`,
        "new",
        number,
      );
      await finding(
        pool,
        fixture.primary,
        `Paging Triaged ${number}`,
        "triaged",
        number,
      );
    }
    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.goto(fixture.path);
    let failures = 0;
    await page.route(`**/w/${fixture.slug}/findings/more?**`, async (route) => {
      if (
        new URL(route.request().url()).searchParams.get("column") !== "new" ||
        failures >= 2
      ) {
        await route.continue();
        return;
      }
      failures += 1;
      if (failures === 1)
        await route.fulfill({ status: 500, body: "Temporary failure" });
      else await route.abort("failed");
    });
    await page
      .getByRole("button", { name: "Load more New findings", exact: true })
      .click();
    const retry = page.getByRole("button", {
      name: "Retry loading New findings",
      exact: true,
    });
    await expect(retry).toBeVisible();
    await expect(
      column(page, "New").getByRole("link", { name: /^Paging New /u }),
    ).toHaveCount(20);
    await expect(
      column(page, "New").getByRole("heading", {
        name: "New (22)",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Load more Triaged findings", exact: true })
      .click();
    const triagedComplete = page.getByRole("button", {
      name: "All findings loaded for Triaged",
      exact: true,
    });
    await expect(triagedComplete).toBeFocused();
    await expect(triagedComplete).toBeDisabled();
    await expect(
      column(page, "Triaged").getByRole("link", { name: /^Paging Triaged /u }),
    ).toHaveCount(22);
    await retry.click();
    await expect(retry).toBeVisible();
    await expect(
      column(page, "New").getByRole("link", { name: /^Paging New /u }),
    ).toHaveCount(20);
    await retry.click();
    const complete = page.getByRole("button", {
      name: "All findings loaded for New",
      exact: true,
    });
    await expect(complete).toBeFocused();
    await expect(complete).toBeDisabled();
    await expect(column(page, "New").getByRole("status")).toHaveText(
      "All New findings loaded.",
    );
    await expect(
      column(page, "New").getByRole("link", { name: /^Paging New /u }),
    ).toHaveCount(22);
  } finally {
    await cleanup(pool, fixture, [owner.id]);
  }
});

for (const resetKind of [
  "reset",
  "401",
  "403",
  "redirect",
  "mobile",
] as const) {
  test(`board pagination clears stale rows on ${resetKind} and restores only removed focus`, async ({
    page,
    context,
  }) => {
    const owner = await verifiedAccount(context);
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const fixture = await workspaceFixture(page, pool);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested = false;
    let deliverReset!: () => void;
    const resetResponse = new Promise<void>((resolve) => {
      deliverReset = resolve;
    });
    try {
      for (let number = 1; number <= 21; number++)
        await finding(
          pool,
          fixture.primary,
          `Reset finding ${number}`,
          "new",
          number,
        );
      if (resetKind === "mobile")
        await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(fixture.path);
      await page.route(`**/w/${fixture.slug}?**`, async (route) => {
        if (route.request().headers().rsc) await gate;
        await route.continue();
      });
      await page.route(
        `**/w/${fixture.slug}/findings/more?**`,
        async (route) => {
          requested = true;
          await resetResponse;
          if (resetKind === "redirect")
            await route.fulfill({
              status: 307,
              headers: { location: "/login" },
            });
          else
            await route.fulfill({
              status: ["reset", "mobile"].includes(resetKind)
                ? 200
                : Number(resetKind),
              contentType: "application/json",
              body: JSON.stringify({ reset: true }),
            });
        },
      );
      await page
        .getByRole("button", { name: "Load more New findings", exact: true })
        .click();
      await expect.poll(() => requested).toBe(true);
      const outsideControl = page.getByRole("button", {
        name: "Theme",
        exact: true,
      });
      const resetFocus =
        resetKind === "mobile"
          ? page.getByRole("button", { name: /^Filters \(/u })
          : page.getByRole("searchbox", {
              name: "Search findings",
              exact: true,
            });
      if (resetKind === "403") await outsideControl.focus();
      deliverReset();
      const message = page.getByText(
        "Board data needs to be refreshed. Access or findings may have changed.",
        { exact: true },
      );
      await expect(message).toBeVisible();
      if (resetKind === "403") await expect(outsideControl).toBeFocused();
      else await expect(resetFocus).toBeFocused();
      await expect(
        page.getByRole("link", { name: /^Reset finding /u }),
      ).toHaveCount(0);
      release();
      await expect(
        page.getByRole("button", {
          name: "Load more New findings",
          exact: true,
        }),
      ).toBeEnabled();
      await expect(
        page.getByRole("link", { name: /^Reset finding /u }),
      ).toHaveCount(20);
      await expect(message).not.toBeVisible();
      if (resetKind === "403") await expect(outsideControl).toBeFocused();
      else await expect(resetFocus).toBeFocused();
    } finally {
      deliverReset();
      release();
      await page.unrouteAll({ behavior: "wait" });
      await cleanup(pool, fixture, [owner.id]);
    }
  });
}

for (const change of ["mutation", "filter"] as const) {
  test(`board discards pagination responses delayed across a ${change}`, async ({
    page,
    context,
  }) => {
    const owner = await verifiedAccount(context);
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const fixture = await workspaceFixture(page, pool);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let captured = false;
    try {
      for (let number = 1; number <= 22; number++)
        await finding(
          pool,
          fixture.primary,
          `Delayed finding ${number}`,
          "new",
          number,
        );
      await page.setViewportSize({ width: 2560, height: 1440 });
      await page.goto(fixture.path);
      await page.route(
        `**/w/${fixture.slug}/findings/more?**`,
        async (route) => {
          const response = await route.fetch();
          captured = true;
          await gate;
          await route.fulfill({ response });
        },
      );
      await page
        .getByRole("button", { name: "Load more New findings", exact: true })
        .click();
      await expect.poll(() => captured).toBe(true);
      if (change === "mutation") {
        await changeStatus(page, "Delayed finding 22", "Triaged");
        await expect(
          column(page, "Triaged").getByRole("link", {
            name: "Delayed finding 22",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          column(page, "New").getByRole("heading", {
            name: "New (21)",
            exact: true,
          }),
        ).toBeVisible();
      } else {
        await page
          .getByRole("searchbox", { name: "Search findings", exact: true })
          .fill("No matching title");
        await applyFilters(page);
        await expect(
          column(page, "New").getByRole("heading", {
            name: "New (0)",
            exact: true,
          }),
        ).toBeVisible();
      }
      const delivered = page.waitForResponse((response) =>
        response.url().includes(`/w/${fixture.slug}/findings/more?`),
      );
      release();
      await delivered;
      await expect(
        column(page, "New").getByRole("link", { name: /^Delayed finding /u }),
      ).toHaveCount(change === "mutation" ? 20 : 0);
      await expect(
        page.getByRole("link", { name: "Delayed finding 1", exact: true }),
      ).toHaveCount(0);
    } finally {
      release();
      await page.unrouteAll({ behavior: "wait" });
      await cleanup(pool, fixture, [owner.id]);
    }
  });
}
