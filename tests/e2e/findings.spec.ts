import { test } from "./fixtures";
import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { chooseTheme, origin, verifiedAccount } from "./helpers";

async function fixtures(pool: Pool, userId: string) {
  const workspaceId = randomUUID();
  const slug = `findings-${randomUUID()}`;
  const serviceIds = [randomUUID(), randomUUID()];
  await pool.query(
    "INSERT INTO organization (id,name,slug,created_at) VALUES ($1,$2,$3,now())",
    [workspaceId, "Findings workspace", slug],
  );
  await pool.query(
    "INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,$4,now())",
    [randomUUID(), workspaceId, userId, "owner"],
  );
  for (const [index, id] of serviceIds.entries()) {
    await pool.query(
      "INSERT INTO service (id,workspace_id,name) VALUES ($1,$2,$3)",
      [id, workspaceId, `Affected service ${index + 1}`],
    );
  }
  return {
    workspaceId,
    slug,
    serviceIds,
    path: (id: string) => `/w/${slug}/services/${id}`,
  };
}

async function cleanup(
  pool: Pool,
  fixture: Awaited<ReturnType<typeof fixtures>>,
  users: (string | undefined)[],
) {
  // Direct deletion is test-fixture cleanup only; the application exposes no finding deletion.
  await pool.query("DELETE FROM finding WHERE service_id = ANY($1::text[])", [
    fixture.serviceIds,
  ]);
  await pool.query("DELETE FROM service WHERE workspace_id = $1", [
    fixture.workspaceId,
  ]);
  await pool.query("DELETE FROM organization WHERE id = $1", [
    fixture.workspaceId,
  ]);
  await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [
    users.filter(Boolean),
  ]);
}

async function selectValue(page: Page, label: string, value: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: value, exact: true }).click();
}

async function createFinding(
  page: Page,
  servicePath: string,
  title = "Shared vulnerability",
) {
  await page.goto(`${servicePath}/findings/new`);
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("Description", { exact: true })
    .fill("The same underlying issue affects this service.");
  const severity = page.getByRole("combobox", {
    name: "Severity",
    exact: true,
  });
  await severity.focus();
  await severity.press("ArrowDown");
  await page.getByRole("option", { name: "High", exact: true }).press("h");
  await page.keyboard.press("Enter");
  await expect(severity).toContainText("High");
  expect(
    await page
      .locator("form")
      .evaluate((form) =>
        new FormData(form as HTMLFormElement).getAll("severity"),
      ),
  ).toEqual(["high"]);
  await page
    .getByLabel("Reference URLs", { exact: true })
    .fill(
      "https://advisories.example.com/details?id=123#fix\nhttps://advisories.example.com/",
    );
  await page
    .getByLabel("Remediation notes", { exact: true })
    .fill("Upgrade the affected component.");
  await page
    .getByRole("button", { name: "Create finding", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`${servicePath}/findings/[^/]+$`, "u"),
  );
  return page.url();
}

test("findings resolve independently per service, reopen, and preserve stale edits", async ({
  page,
  context,
}) => {
  const person = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const fixture = await fixtures(pool, person.id);
  try {
    const firstURL = await createFinding(
      page,
      fixture.path(fixture.serviceIds[0]),
    );
    await expect(
      page.locator(
        'a[href="https://advisories.example.com/details?id=123#fix"]',
      ),
    ).toBeVisible();
    await expect(
      page.locator('a[href="https://advisories.example.com/"]'),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /delete/iu })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /delete/iu })).toHaveCount(0);
    const secondURL = await createFinding(
      page,
      fixture.path(fixture.serviceIds[1]),
    );
    await page.goto(`${firstURL}/edit`);
    await page
      .getByLabel("Remediation notes", { exact: true })
      .fill("Unsaved remediation draft");
    await chooseTheme(page, "Dark");
    await expect(
      page.getByLabel("Remediation notes", { exact: true }),
    ).toHaveValue("Unsaved remediation draft");
    await selectValue(page, "Status", "Resolved");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page).toHaveURL(firstURL);
    await expect(
      page.locator("main span").filter({ hasText: /^Resolved$/u }),
    ).toBeVisible();
    const firstId = new URL(firstURL).pathname.split("/").at(-1);
    const secondId = new URL(secondURL).pathname.split("/").at(-1);
    const firstState = (
      await pool.query(
        "SELECT status, resolved_at FROM finding WHERE id = $1",
        [firstId],
      )
    ).rows[0];
    expect(firstState.resolved_at).not.toBeNull();
    expect(
      (
        await pool.query(
          "SELECT status, resolved_at FROM finding WHERE id = $1",
          [secondId],
        )
      ).rows[0],
    ).toMatchObject({ status: "new", resolved_at: null });

    const staleTab = await context.newPage();
    let releasePreference!: () => void;
    const preferenceGate = new Promise<void>((resolve) => {
      releasePreference = resolve;
    });
    let preferenceHeld = false;
    let preferencePayload = "";
    try {
      // Deliver refreshed server props after the user has started editing an older version.
      await staleTab.route("**/*", async (route) => {
        if (
          !preferenceHeld &&
          route.request().method() === "POST" &&
          route.request().headers()["next-action"]
        ) {
          preferenceHeld = true;
          await preferenceGate;
          const response = await route.fetch();
          preferencePayload = await response.text();
          await route.fulfill({ response, body: preferencePayload });
          return;
        }
        await route.continue();
      });
      await staleTab.goto(`${firstURL}/edit`);
      await expect.poll(() => preferenceHeld).toBe(true);
      await staleTab
        .getByLabel("Description", { exact: true })
        .fill("Unsaved stale description");
      await page.goto(`${firstURL}/edit`);
      await page
        .getByLabel("Title", { exact: true })
        .fill("Updated vulnerability");
      await selectValue(page, "Status", "In progress");
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(page).toHaveURL(firstURL);
      const preferenceResponse = staleTab.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          !!response.request().headers()["next-action"],
      );
      releasePreference();
      const refresh = await preferenceResponse;
      expect(refresh.ok()).toBeTruthy();
      expect(preferencePayload).toContain("Updated vulnerability");
      await refresh.finished();
      await staleTab.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(
        staleTab.getByLabel("Description", { exact: true }),
      ).toHaveValue("Unsaved stale description");
      await staleTab
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(
        staleTab.getByRole("alert").filter({ hasText: /changed|reload/iu }),
      ).toBeVisible();
      await expect(
        staleTab.getByLabel("Description", { exact: true }),
      ).toHaveValue("Unsaved stale description");
      expect(
        (
          await pool.query("SELECT resolved_at FROM finding WHERE id = $1", [
            firstId,
          ])
        ).rows[0].resolved_at,
      ).toBeNull();
    } finally {
      releasePreference();
      await staleTab.close();
    }
    await page.goto(fixture.path(fixture.serviceIds[0]));
    await page
      .getByRole("link", { name: "Updated vulnerability", exact: true })
      .click();
    await expect(page).toHaveURL(firstURL);
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("finding-mobile-dark.png"),
      fullPage: true,
    });
  } finally {
    await cleanup(pool, fixture, [person.id]);
    await pool.end();
  }
});

test("members create and update findings, with no deletion and archived-service writes blocked", async ({
  page,
  context,
  browser,
}) => {
  const owner = await verifiedAccount(context);
  const memberContext = await browser.newContext();
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const fixture = await fixtures(pool, owner.id);
  let memberId: string | undefined;
  try {
    memberId = (await verifiedAccount(memberContext)).id;
    await pool.query(
      "INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,$4,now())",
      [randomUUID(), fixture.workspaceId, memberId, "member"],
    );
    const memberPage = await memberContext.newPage();
    await memberPage.goto(`${origin}${fixture.path(fixture.serviceIds[0])}`);
    await expect(
      memberPage.getByRole("link", { name: "Create finding", exact: true }),
    ).toBeVisible();
    const findingURL = await createFinding(
      memberPage,
      fixture.path(fixture.serviceIds[0]),
      "Member finding",
    );
    await memberPage.goto(`${findingURL}/edit`);
    await selectValue(memberPage, "Status", "Accepted risk");
    await memberPage
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(memberPage).toHaveURL(findingURL);
    await expect(
      memberPage.getByText("Accepted risk", { exact: true }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("button", { name: /delete/iu }),
    ).toHaveCount(0);
    await expect(
      memberPage.getByRole("link", { name: /delete/iu }),
    ).toHaveCount(0);
    const findingId = new URL(findingURL).pathname.split("/").at(-1);
    await page.goto(
      `${fixture.path(fixture.serviceIds[1])}/findings/${findingId}`,
    );
    await expect(page.getByText("404", { exact: true })).toBeVisible();

    await page.goto(fixture.path(fixture.serviceIds[0]));
    await page
      .getByRole("checkbox", {
        name: "I understand this service will leave the active list.",
      })
      .check();
    await page
      .getByRole("button", { name: "Archive service", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Restore service", exact: true }),
    ).toBeVisible();
    await memberPage.goto(findingURL);
    await expect(
      memberPage.getByRole("heading", { name: "Member finding", exact: true }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("link", { name: "Edit finding", exact: true }),
    ).toHaveCount(0);
    for (const url of [
      `${findingURL}/edit`,
      `${origin}${fixture.path(fixture.serviceIds[0])}/findings/new`,
    ]) {
      await memberPage.goto(url);
      await expect(
        memberPage.getByText(
          "Restore this service from its detail page before creating or editing findings.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        memberPage.getByRole("button", {
          name: /Create finding|Save changes/u,
        }),
      ).toHaveCount(0);
    }
    await page
      .getByRole("checkbox", {
        name: "I want to restore this service to the active list.",
      })
      .check();
    await page
      .getByRole("button", { name: "Restore service", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Edit service", exact: true }),
    ).toBeVisible();
    await memberPage.goto(`${findingURL}/edit`);
    await memberPage
      .getByLabel("Remediation notes", { exact: true })
      .fill("Member can work on the restored service again.");
    await memberPage
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(memberPage).toHaveURL(findingURL);
    await expect(
      memberPage.getByText("Member can work on the restored service again.", {
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await memberContext.close();
    await cleanup(pool, fixture, [owner.id, memberId]);
    await pool.end();
  }
});
