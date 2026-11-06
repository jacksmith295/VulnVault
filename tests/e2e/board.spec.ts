import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { test } from "./fixtures";
import { chooseTheme, origin, verifiedAccount } from "./helpers";

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
    path: `/w/${slug}/findings`,
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
    await page.getByRole("link", { name: "Findings", exact: true }).click();
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
    await staleTab.goto(`${origin}${fixture.path}`);
    await expect(
      staleTab.getByRole("link", { name: "Stale finding", exact: true }),
    ).toHaveCount(0);
    await staleTab
      .getByRole("button", { name: "Load more New findings", exact: true })
      .click();
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
    await staleTab.close();
    await cleanup(pool, fixture, [owner.id]);
  }
});
