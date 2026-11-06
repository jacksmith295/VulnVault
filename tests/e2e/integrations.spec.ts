import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { Pool } from "pg";
import { test } from "./fixtures";
import { chooseTheme, origin, verifiedAccount } from "./helpers";

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
    await page.getByRole("link", { name: "Integrations", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Integrations", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "GitHub: example", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sync now", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText("Sync in progress.", { exact: true }),
    ).toBeVisible();
    expect(await page.content()).not.toContain(leaseToken);
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
    for (const route of [detail, `/w/${slug}/integrations`]) {
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
      memberPage.getByRole("link", { name: "Integrations", exact: true }),
    ).toHaveCount(0);
    await memberPage.goto(`${origin}/w/${slug}/integrations`);
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
