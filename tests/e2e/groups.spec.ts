import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { chooseTheme, origin, verifiedAccount } from "./helpers";

async function createWorkspace(page: Page, slug: string) {
  await page.goto("/workspaces/new");
  await page
    .getByLabel("Workspace name", { exact: true })
    .fill("Group access workspace");
  await page.getByLabel("URL slug", { exact: true }).fill(slug);
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(page).toHaveURL(`${origin}/w/${slug}`);
}

async function createService(page: Page, path: string) {
  await page.goto(`${path}/services/new`);
  await page.getByLabel("Name", { exact: true }).fill("Payments API");
  await page
    .getByLabel("Repository URLs", { exact: true })
    .fill("https://git.example.com/payments/api");
  await page
    .getByRole("button", { name: "Create service", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Payments API", exact: true }),
  ).toBeVisible();
  return page.url();
}

async function submitGroup(page: Page) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      !!response.request().headers()["next-action"] &&
      (response.request().headers()["content-type"] ?? "").startsWith(
        "multipart/form-data",
      ),
  );
  await page.getByRole("button", { name: "Save group", exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  await expect(
    page.getByRole("button", { name: "Save group", exact: true }),
  ).toBeEnabled();
}

async function createGroup(
  page: Page,
  workspacePath: string,
  name: string,
  email?: string,
) {
  await page.goto(`${workspacePath}/groups`);
  await page.getByLabel("Group name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`${workspacePath}/groups/[^/]+$`, "u"),
  );
  const url = page.url();
  if (email) {
    await page
      .getByRole("checkbox", {
        name: `Workspace Developer (${email})`,
        exact: true,
      })
      .check();
    await submitGroup(page);
    await expect(
      page.getByRole("button", { name: "Save group", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("checkbox", {
        name: `Workspace Developer (${email})`,
        exact: true,
      }),
    ).toBeChecked();
  }
  return url;
}

async function setGroupMember(
  page: Page,
  groupURL: string,
  email: string,
  selected: boolean,
) {
  await page.goto(groupURL);
  await page
    .getByRole("checkbox", {
      name: `Workspace Developer (${email})`,
      exact: true,
    })
    .setChecked(selected);
  await submitGroup(page);
  await expect(
    page.getByRole("button", { name: "Save group", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("checkbox", {
      name: `Workspace Developer (${email})`,
      exact: true,
    }),
  ).toBeChecked({ checked: selected });
}

async function accessMode(
  page: Page,
  label: "Default group" | "Selected groups",
) {
  await page
    .getByRole("combobox", { name: "Access mode", exact: true })
    .click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

async function saveAccess(page: Page, serviceURL: string, groups: string[]) {
  await page.goto(`${serviceURL}/access`);
  await accessMode(page, "Selected groups");
  for (const name of groups)
    await page.getByRole("checkbox", { name, exact: true }).check();
  await page.getByRole("button", { name: "Save access", exact: true }).click();
  await expect(page).toHaveURL(serviceURL);
}

async function cleanup(
  pool: Pool,
  slug: string,
  userIds: (string | undefined)[],
) {
  // Fixture cleanup only. Finding deletion is unavailable in the application.
  await pool.query(
    "DELETE FROM finding WHERE service_id IN (SELECT id FROM service WHERE workspace_id IN (SELECT id FROM organization WHERE slug = $1))",
    [slug],
  );
  await pool.query(
    "DELETE FROM service WHERE workspace_id IN (SELECT id FROM organization WHERE slug = $1)",
    [slug],
  );
  await pool.query("DELETE FROM organization WHERE slug = $1", [slug]);
  await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [
    userIds.filter(Boolean),
  ]);
  await pool.end();
}

test("default access, custom groups, revocation and explicit fallback apply to services and findings", async ({
  page,
  context,
  browser,
}) => {
  const owner = await verifiedAccount(context);
  const memberContext = await browser.newContext();
  const colleagueContext = await browser.newContext();
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const slug = `groups-${randomUUID()}`;
  const workspacePath = `/w/${slug}`;
  let memberId: string | undefined;
  let colleagueId: string | undefined;
  try {
    await createWorkspace(page, slug);
    const member = await verifiedAccount(memberContext);
    const colleague = await verifiedAccount(colleagueContext);
    memberId = member.id;
    colleagueId = colleague.id;
    const workspaceId = (
      await pool.query("SELECT id FROM organization WHERE slug = $1", [slug])
    ).rows[0].id;
    for (const userId of [member.id, colleague.id]) {
      await pool.query(
        "INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,$4,now())",
        [randomUUID(), workspaceId, userId, "member"],
      );
    }
    const serviceURL = await createService(page, workspacePath);
    const memberPage = await memberContext.newPage();
    const colleaguePage = await colleagueContext.newPage();
    await memberPage.goto(serviceURL);
    await expect(
      memberPage.getByRole("heading", { name: "Payments API", exact: true }),
    ).toBeVisible();
    await expect(
      memberPage.getByRole("link", { name: "Manage access", exact: true }),
    ).toHaveCount(0);

    await memberPage
      .getByRole("link", { name: "Create finding", exact: true })
      .click();
    await memberPage
      .getByLabel("Title", { exact: true })
      .fill("Private payment finding");
    await memberPage
      .getByLabel("Description", { exact: true })
      .fill("Original private finding description");
    await memberPage
      .getByRole("combobox", { name: "Severity", exact: true })
      .click();
    await memberPage.getByRole("option", { name: "High", exact: true }).click();
    await memberPage
      .getByRole("button", { name: "Create finding", exact: true })
      .click();
    await expect(
      memberPage.getByRole("heading", {
        name: "Private payment finding",
        exact: true,
      }),
    ).toBeVisible();
    const findingURL = memberPage.url();
    const findingId = new URL(findingURL).pathname.split("/").at(-1);

    const paymentsURL = await createGroup(
      page,
      workspacePath,
      "Payments",
      member.email,
    );
    const securityURL = await createGroup(page, workspacePath, "Security");
    await saveAccess(page, serviceURL, ["Payments"]);
    await colleaguePage.goto(`${origin}${workspacePath}`);
    await expect(
      colleaguePage.getByRole("link", { name: "Payments API", exact: true }),
    ).toHaveCount(0);
    for (const url of [
      serviceURL,
      findingURL,
      `${findingURL}/edit`,
      `${serviceURL}/findings/new`,
      `${origin}${workspacePath}/groups`,
      `${serviceURL}/access`,
    ]) {
      await colleaguePage.goto(url);
      await expect(
        colleaguePage.getByText("404", { exact: true }),
      ).toBeVisible();
      await expect(
        colleaguePage.getByText("Original private finding description", {
          exact: true,
        }),
      ).toHaveCount(0);
    }
    await memberPage.goto(`${findingURL}/edit`);
    await memberPage
      .getByLabel("Description", { exact: true })
      .fill("Draft after revocation");
    await setGroupMember(page, paymentsURL, member.email, false);
    await memberPage
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(memberPage.getByRole("alert")).toBeVisible();
    expect(
      (
        await pool.query("SELECT description FROM finding WHERE id = $1", [
          findingId,
        ])
      ).rows[0].description,
    ).toBe("Original private finding description");
    await memberPage.reload();
    await expect(memberPage.getByText("404", { exact: true })).toBeVisible();

    await setGroupMember(page, securityURL, member.email, true);
    await saveAccess(page, serviceURL, ["Payments", "Security"]);
    await memberPage.goto(findingURL);
    await expect(
      memberPage.getByRole("heading", {
        name: "Private payment finding",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto(`${serviceURL}/access`);
    await accessMode(page, "Default group");
    await page
      .getByRole("button", { name: "Save access", exact: true })
      .click();
    await expect(page).toHaveURL(`${serviceURL}/access`);
    await expect(
      page.getByRole("checkbox", {
        name: "I understand that all workspace members will gain access.",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("checkbox", {
        name: "I understand that all workspace members will gain access.",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Save access", exact: true })
      .click();
    await expect(page).toHaveURL(serviceURL);
    await colleaguePage.goto(findingURL);
    await expect(
      colleaguePage.getByRole("heading", {
        name: "Private payment finding",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto(`${workspacePath}/groups`);
    await page.getByRole("link", { name: "Everyone", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Save group", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Group name", { exact: true })).toHaveCount(0);
  } finally {
    await memberContext.close();
    await colleagueContext.close();
    await cleanup(pool, slug, [owner.id, memberId, colleagueId]);
  }
});

test("stale access and group forms preserve edits without overwriting permissions", async ({
  page,
  context,
}) => {
  const owner = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const slug = `group-stale-${randomUUID()}`;
  const path = `/w/${slug}`;
  const staleTab = await context.newPage();
  let releasePreference!: () => void;
  const preferenceGate = new Promise<void>((resolve) => {
    releasePreference = resolve;
  });
  let preferenceHeld = false;
  let preferencePayload = "";
  try {
    await createWorkspace(page, slug);
    const serviceURL = await createService(page, path);
    const paymentsURL = await createGroup(page, path, "Payments");
    await createGroup(page, path, "Security");
    // Refresh dirty access fields with a newer server version before submitting them.
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
    await staleTab.goto(`${serviceURL}/access`);
    await expect.poll(() => preferenceHeld).toBe(true);
    await accessMode(staleTab, "Selected groups");
    await staleTab
      .getByRole("checkbox", { name: "Security", exact: true })
      .check();
    await chooseTheme(staleTab, "Dark");
    await expect(
      staleTab.getByRole("checkbox", { name: "Security", exact: true }),
    ).toBeChecked();
    await saveAccess(page, serviceURL, ["Payments"]);
    const preferenceResponse = staleTab.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        !!response.request().headers()["next-action"],
    );
    releasePreference();
    const refresh = await preferenceResponse;
    expect(refresh.ok()).toBeTruthy();
    const paymentsId = new URL(paymentsURL).pathname.split("/").at(-1);
    expect(preferencePayload).toContain(`"selectedGroupIds":["${paymentsId}"]`);
    await refresh.finished();
    await staleTab.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(
      staleTab.getByRole("checkbox", { name: "Security", exact: true }),
    ).toBeChecked();
    await staleTab
      .getByRole("button", { name: "Save access", exact: true })
      .click();
    await expect(
      staleTab.getByRole("alert").filter({ hasText: /changed|reload/iu }),
    ).toBeVisible();
    await expect(
      staleTab.getByRole("checkbox", { name: "Security", exact: true }),
    ).toBeChecked();
    await page.goto(`${serviceURL}/access`);
    await expect(
      page.getByRole("checkbox", { name: "Payments", exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: "Security", exact: true }),
    ).not.toBeChecked();

    await staleTab.goto(paymentsURL);
    await staleTab
      .getByLabel("Group name", { exact: true })
      .fill("Stale payment draft");
    await page.goto(paymentsURL);
    await page
      .getByLabel("Group name", { exact: true })
      .fill("Payment platform");
    await submitGroup(page);
    await expect(
      page.getByRole("heading", { name: "Payment platform", exact: true }),
    ).toBeVisible();
    await staleTab
      .getByRole("button", { name: "Save group", exact: true })
      .click();
    await expect(
      staleTab.getByRole("alert").filter({ hasText: /changed|reload/iu }),
    ).toBeVisible();
    await expect(
      staleTab.getByLabel("Group name", { exact: true }),
    ).toHaveValue("Stale payment draft");
    await page.reload();
    await expect(page.getByLabel("Group name", { exact: true })).toHaveValue(
      "Payment platform",
    );
    await page.setViewportSize({ width: 375, height: 812 });
    await chooseTheme(page, "Dark");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("group-mobile-dark.png"),
      fullPage: true,
    });
  } finally {
    releasePreference();
    await staleTab.close();
    await cleanup(pool, slug, [owner.id]);
  }
});
