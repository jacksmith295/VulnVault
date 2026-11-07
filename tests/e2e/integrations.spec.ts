import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { Pool } from "pg";
import { test } from "./fixtures";
import { chooseTheme, origin, refreshServerProps, verifiedAccount } from "./helpers";

test("integration administration preserves findings and source access follows service permissions", async ({
  page,
  context,
  browser,
}) => {
  const owner = await verifiedAccount(context);
  const memberContext = await browser.newContext();
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const slug = `integration-browser-${randomUUID()}`;
  const serviceId = randomUUID(),
    linkId = randomUUID(),
    integrationId = randomUUID(),
    mappingId = randomUUID(),
    findingId = randomUUID();
  const leaseToken = randomUUID();
  const failureTrigger = `browser_toggle_${randomUUID().replaceAll("-", "")}`;
  let workspaceId: string | undefined, memberId: string | undefined;
  try {
    await page.goto("/workspaces/new");
    await page
      .getByLabel("Workspace name", { exact: true })
      .fill("Integration workspace");
    await page.getByLabel("URL slug", { exact: true }).fill(slug);
    await page
      .getByRole("button", { name: "Create workspace", exact: true })
      .click();
    await expect(page).toHaveURL(`${origin}/w/${slug}`);
    workspaceId = (
      await pool.query("SELECT id FROM organization WHERE slug=$1", [slug])
    ).rows[0].id;
    await pool.query(
      "INSERT INTO service (id,workspace_id,name) VALUES ($1,$2,'Imported API')",
      [serviceId, workspaceId],
    );
    await pool.query(
      "INSERT INTO service_repository (id,service_id,url) VALUES ($1,$2,'https://github.com/example/browser-fixture')",
      [linkId, serviceId],
    );
    await pool.query(
      "INSERT INTO workspace_integration (id,workspace_id,app_id,installation_id,account_id,account_login,account_type) VALUES ($1,$2,'123','456','789','example','User')",
      [integrationId, workspaceId],
    );
    await pool.query(
      "INSERT INTO integration_repository (id,workspace_id,integration_id,service_id,repository_link_id,repository_id,full_name,lease_token,lease_expires_at) VALUES ($1,$2,$3,$4,$5,'987','example/browser-fixture',$6,now()+interval '1 minute')",
      [mappingId, workspaceId, integrationId, serviceId, linkId, leaseToken],
    );
    await pool.query(
      "INSERT INTO finding (id,service_id,title,description,severity,status,remediation_notes) VALUES ($1,$2,'Imported dependency alert','Local finding description','high','triaged','Keep local notes')",
      [findingId, serviceId],
    );
    await pool.query(
      "INSERT INTO finding_source (finding_id,workspace_id,service_id,repository_id,alert_number,state,upstream_created_at,upstream_updated_at,package_name,ecosystem,manifest_path,ghsa_id,vulnerable_range,patched_version,summary,severity,url) VALUES ($1,$2,$3,'987',12,'fixed',now(),now(),'example-package','npm','package-lock.json','GHSA-aaaa-bbbb-cccc','<2.0.0','2.0.0','Upstream alert summary','high','https://github.com/example/browser-fixture/security/dependabot/12')",
      [findingId, workspaceId, serviceId],
    );
    await page.goto(`/w/${slug}`);
    await page.getByRole("link", { name: "Connections", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Workspace connections", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "GitHub: example", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sync now", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "example/browser-fixture", exact: true })).toHaveCount(0);
    await page.goto(`/w/${slug}/services/${serviceId}`);
    await page.getByRole("link", { name: "Integrations", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/w/${slug}/services/${serviceId}/integrations`);
    await expect(page.getByText("Recommended", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sync now", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByText("Sync in progress.", { exact: true }),
    ).toBeVisible();
    expect(await page.content()).not.toContain(leaseToken);
    await page.getByRole("button", { name: "Sync now", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Another sync is running");
    expect((await pool.query("SELECT count(*)::int AS count FROM finding WHERE service_id=$1", [serviceId])).rows[0].count).toBe(1);
    await page.goto(`/w/${slug}/integrations`);
    await pool.query(`
      CREATE FUNCTION ${failureTrigger}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.id = '${integrationId}' THEN
          RAISE EXCEPTION 'isolated browser toggle failure';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER ${failureTrigger} BEFORE UPDATE ON workspace_integration
      FOR EACH ROW EXECUTE FUNCTION ${failureTrigger}();
    `);
    await page
      .getByRole("button", { name: "Disable connection", exact: true })
      .click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Unable to update this connection. Reload and try again.",
    );
    await expect(page.getByRole("button", {
      name: "Disable connection",
      exact: true,
    })).toBeEnabled();
    await expect(page.getByText(
      "Connection disabled. Imported findings are retained.",
      { exact: true },
    )).toHaveCount(0);
    expect((await pool.query(
      "SELECT enabled FROM workspace_integration WHERE id=$1",
      [integrationId],
    )).rows[0].enabled).toBe(true);
    await pool.query(`DROP TRIGGER ${failureTrigger} ON workspace_integration`);
    await pool.query(`DROP FUNCTION ${failureTrigger}()`);
    await page
      .getByRole("button", { name: "Disable connection", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Enable connection", exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              "SELECT i.enabled,r.lease_token FROM workspace_integration i JOIN integration_repository r ON r.integration_id=i.id WHERE i.id=$1",
              [integrationId],
            )
          ).rows[0]?.lease_token,
      )
      .toBeNull();
    await page
      .getByRole("button", { name: "Enable connection", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Disable connection", exact: true }),
    ).toBeVisible();
    await page.goto(`/w/${slug}/services/${serviceId}/integrations`);
    await page
      .getByRole("button", { name: "Disable repository", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Enable repository", exact: true }),
    ).toBeVisible();
    const detail = `/w/${slug}/services/${serviceId}/findings/${findingId}`;
    await page.goto(detail);
    await expect(
      page.getByRole("heading", { name: "Dependabot source", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Fixed", { exact: true })).toBeVisible();
    await expect(page.getByText("Triaged", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Keep local notes", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: "View Dependabot alert on GitHub",
        exact: true,
      }),
    ).toHaveAttribute(
      "href",
      "https://github.com/example/browser-fixture/security/dependabot/12",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await chooseTheme(page, "Dark");
    for (const route of [detail, `/w/${slug}/integrations`, `/w/${slug}/services/${serviceId}/integrations`]) {
      await page.goto(route);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.screenshot({
      path: test.info().outputPath("integrations-mobile-dark.png"),
      fullPage: true,
    });
    const member = await verifiedAccount(memberContext);
    memberId = member.id;
    const membershipId = randomUUID();
    await pool.query(
      "INSERT INTO member (id,user_id,organization_id,role,created_at) VALUES ($1,$2,$3,'member',now())",
      [membershipId, member.id, workspaceId],
    );
    const memberPage = await memberContext.newPage();
    await memberPage.goto(`${origin}/w/${slug}`);
    await expect(
      memberPage.getByRole("link", { name: "Connections", exact: true }),
    ).toHaveCount(0);
    await memberPage.goto(`${origin}/w/${slug}/integrations`);
    await expect(memberPage.getByText("404", { exact: true })).toBeVisible();
    await memberPage.goto(`${origin}/w/${slug}/services/${serviceId}`);
    await expect(memberPage.getByRole("link", { name: "Integrations", exact: true })).toHaveCount(0);
    await memberPage.goto(`${origin}/w/${slug}/services/${serviceId}/integrations`);
    await expect(memberPage.getByText("404", { exact: true })).toBeVisible();
    await memberPage.goto(`${origin}${detail}`);
    await expect(
      memberPage.getByRole("heading", {
        name: "Dependabot source",
        exact: true,
      }),
    ).toBeVisible();
    const groupId = randomUUID();
    await pool.query(
      "INSERT INTO workspace_group (id,workspace_id,name) VALUES ($1,$2,'Restricted imports')",
      [groupId, workspaceId],
    );
    await pool.query(
      "INSERT INTO service_access_group (workspace_id,service_id,group_id) VALUES ($1,$2,$3)",
      [workspaceId, serviceId, groupId],
    );
    await memberPage.reload();
    await expect(memberPage.getByText("404", { exact: true })).toBeVisible();
    expect(
      (
        await pool.query(
          "SELECT status,remediation_notes FROM finding WHERE id=$1",
          [findingId],
        )
      ).rows[0],
    ).toEqual({ status: "triaged", remediation_notes: "Keep local notes" });
  } finally {
    await memberContext.close();
    await pool.query(`DROP TRIGGER IF EXISTS ${failureTrigger} ON workspace_integration`);
    await pool.query(`DROP FUNCTION IF EXISTS ${failureTrigger}()`);
    if (workspaceId) {
      await pool.query(
        "DELETE FROM integration_repository WHERE workspace_id=$1",
        [workspaceId],
      );
      await pool.query(
        "DELETE FROM workspace_integration WHERE workspace_id=$1",
        [workspaceId],
      );
      await pool.query(
        "DELETE FROM finding WHERE service_id IN (SELECT id FROM service WHERE workspace_id=$1)",
        [workspaceId],
      );
      await pool.query("DELETE FROM service WHERE workspace_id=$1", [
        workspaceId,
      ]);
      await pool.query("DELETE FROM organization WHERE id=$1", [workspaceId]);
    }
    await pool.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [
      [owner.id, memberId].filter(Boolean),
    ]);
    await pool.end();
  }
});

test("repository connection selection clears removed options and preserves valid drafts on refresh", async ({
  page,
  context,
}) => {
  const owner = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const slug = `connection-draft-${randomUUID()}`;
  const serviceId = randomUUID();
  const integrationId = randomUUID();
  const selectedId = randomUUID();
  const otherId = randomUUID();
  let workspaceId: string | undefined;
  try {
    await page.goto("/workspaces/new");
    await page.getByLabel("Workspace name", { exact: true }).fill("Connection draft");
    await page.getByLabel("URL slug", { exact: true }).fill(slug);
    await page.getByRole("button", { name: "Create workspace", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/w/${slug}`);
    workspaceId = (await pool.query("SELECT id FROM organization WHERE slug=$1", [slug])).rows[0].id;
    await pool.query("INSERT INTO service (id,workspace_id,name) VALUES ($1,$2,'Draft API')", [serviceId, workspaceId]);
    await pool.query(
      "INSERT INTO service_repository (id,service_id,url) VALUES ($1,$3,'https://github.com/example/selected-draft'),($2,$3,'https://github.com/example/other-draft')",
      [selectedId, otherId, serviceId],
    );
    await pool.query(
      "INSERT INTO workspace_integration (id,workspace_id,app_id,installation_id,account_id,account_login,account_type) VALUES ($1,$2,'123','456','789','example','User')",
      [integrationId, workspaceId],
    );
    // The browser server uses fake App metadata with no usable private key.
    // Refresh server props after a DB mapping insert instead of contacting GitHub.
    await page.goto(`/w/${slug}/services/${serviceId}/integrations`);
    const selection = page.getByLabel("Existing service repository", { exact: true });
    const connect = page.getByRole("button", { name: "Connect repository", exact: true });
    const label = "Draft API: https://github.com/example/selected-draft";
    await expect(connect).toBeDisabled();
    await selection.click();
    await page.getByRole("option", { name: label, exact: true }).click();
    await expect(connect).toBeEnabled();
    await refreshServerProps(page);
    await expect(selection).toContainText(label);
    await expect(connect).toBeEnabled();
    await pool.query(
      "INSERT INTO integration_repository (id,workspace_id,integration_id,service_id,repository_link_id,repository_id,full_name) VALUES ($1,$2,$3,$4,$5,'987','example/selected-draft')",
      [randomUUID(), workspaceId, integrationId, serviceId, selectedId],
    );
    await refreshServerProps(page);
    await expect(page.getByRole("heading", { name: "example/selected-draft", exact: true })).toBeVisible();
    await expect(selection).toContainText("Choose a GitHub repository");
    await expect(connect).toBeDisabled();
    await expect(page.locator('input[name="repositoryLinkId"]')).not.toHaveValue(selectedId);
    await selection.click();
    await expect(page.getByRole("option", { name: label, exact: true })).toHaveCount(0);
    await page.getByRole("option", {
      name: "Draft API: https://github.com/example/other-draft",
      exact: true,
    }).click();
    await expect(connect).toBeEnabled();
  } finally {
    if (workspaceId) {
      await pool.query("DELETE FROM integration_repository WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM workspace_integration WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM service WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM organization WHERE id=$1", [workspaceId]);
    }
    await pool.query('DELETE FROM "user" WHERE id=$1', [owner.id]);
    await pool.end();
  }
});

test("service recommendations distinguish compatibility from access and keep connection conflicts scoped", async ({ page, context }) => {
  const owner = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const slug = `service-integrations-${randomUUID()}`;
  const serviceId = randomUUID(), otherId = randomUUID(), unsupportedId = randomUUID();
  const linkId = randomUUID(), oldLinkId = randomUUID(), otherLinkId = randomUUID();
  const installationId = randomUUID(), oldInstallationId = randomUUID(), disabledId = randomUUID();
  const mappingId = randomUUID();
  let workspaceId: string | undefined;
  try {
    await page.goto("/workspaces/new");
    await page.getByLabel("Workspace name", { exact: true }).fill("Service connections");
    await page.getByLabel("URL slug", { exact: true }).fill(slug);
    await page.getByRole("button", { name: "Create workspace", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/w/${slug}`);
    workspaceId = (await pool.query("SELECT id FROM organization WHERE slug=$1", [slug])).rows[0].id;
    await pool.query("INSERT INTO service (id,workspace_id,name) VALUES ($1,$4,'Recommended API'),($2,$4,'Other API'),($3,$4,'GitLab API')", [serviceId, otherId, unsupportedId, workspaceId]);
    await pool.query("INSERT INTO service_repository (id,service_id,url) VALUES ($1,$4,'https://github.com/example/candidate'),($2,$4,'https://github.com/example/previous'),($3,$5,'https://github.com/example/other-service'),($6,$7,'https://gitlab.com/example/unsupported')", [linkId, oldLinkId, otherLinkId, serviceId, otherId, randomUUID(), unsupportedId]);
    await pool.query("INSERT INTO workspace_integration (id,workspace_id,app_id,installation_id,account_id,account_login,account_type,enabled) VALUES ($1,$4,'123','1001','2001','Current','User',true),($2,$4,'999','1002','2002','Previous','User',true),($3,$4,'123','1003','2003','Disabled','User',false)", [installationId, oldInstallationId, disabledId, workspaceId]);
    await pool.query("INSERT INTO integration_repository (id,workspace_id,integration_id,service_id,repository_link_id,repository_id,full_name) VALUES ($1,$2,$3,$4,$5,'987','example/previous'),($6,$2,$7,$8,$9,'988','example/other-service')", [mappingId, workspaceId, oldInstallationId, serviceId, oldLinkId, randomUUID(), installationId, otherId, otherLinkId]);
    const path = `/w/${slug}/services/${serviceId}/integrations`;
    await page.goto(path);
    await expect(page.getByText("Recommended", { exact: true })).toBeVisible();
    await expect(page.getByText(/does not verify the App configuration/iu)).toBeVisible();
    await expect(page.getByRole("heading", { name: "example/other-service", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Disable connection", exact: true })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Existing service repository", exact: true })).toHaveCount(1);
    const previous = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "example/previous", exact: true }) });
    await expect(previous.getByRole("button", { name: "Sync now", exact: true })).toBeDisabled();
    await expect(page.getByText("Configured for another GitHub App", { exact: true })).toBeVisible();
    // A stale mapping edit must recover to this service, not workspace settings.
    await pool.query("UPDATE integration_repository SET version=version+1 WHERE id=$1", [mappingId]);
    await previous.getByRole("button", { name: "Disable repository", exact: true }).click();
    const reload = page.getByRole("link", { name: "Reload latest connection settings", exact: true });
    await expect(reload).toHaveAttribute("href", path);
    expect((await pool.query("SELECT enabled FROM integration_repository WHERE id=$1", [mappingId])).rows[0].enabled).toBe(true);
    await reload.click();
    await expect(page).toHaveURL(`${origin}${path}`);
    await pool.query("UPDATE service SET archived_at=now(),version=version+1 WHERE id=$1", [serviceId]);
    await page.reload();
    await expect(page.getByRole("button", { name: "Connect repository", exact: true })).toHaveCount(0);
    await expect(previous.getByRole("button", { name: "Sync now", exact: true })).toBeDisabled();
    await expect(previous.getByRole("button", { name: "Disable repository", exact: true })).toBeEnabled();
    for (const [theme, width] of [["Light", 1440], ["Dark", 320]] as const) {
      await page.setViewportSize({ width, height: 900 });
      await chooseTheme(page, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`service-integrations-${theme}-${width}.png`), fullPage: true });
    }
    await page.goto(`/w/${slug}/services/${unsupportedId}/integrations`);
    await expect(page.getByText("Recommended", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Connect repository", exact: true })).toHaveCount(0);
    await expect(page.getByText(/other repository URLs can remain linked/iu)).toBeVisible();
    await page.goto(`/w/${slug}/integrations`);
    await expect(page.getByRole("button", { name: "Sync now", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Connect repository", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "example/previous", exact: true })).toHaveCount(0);
  } finally {
    if (workspaceId) {
      await pool.query("DELETE FROM integration_repository WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM workspace_integration WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM service WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM organization WHERE id=$1", [workspaceId]);
    }
    await pool.query('DELETE FROM "user" WHERE id=$1', [owner.id]);
    await pool.end();
  }
});
