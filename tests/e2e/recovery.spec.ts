import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import type { Pool } from "pg";
import { migrateRecovery, recoveredServer, recoverySandbox } from "../helpers/recovery";

const password = "SyntheticRecoveryPassword-123!";
const email = "recovered-member@example.test";

// Fixed IDs are safe because every rehearsal uses newly created, isolated databases.
async function seedCore(pool: Pool) {
  await pool.query(`
    INSERT INTO users (full_name,email,password_hash)
      VALUES ('Legacy scaffold account','legacy@example.test','synthetic-legacy-hash');
    INSERT INTO "user" (id,name,email,email_verified)
      VALUES ('recovery-user','Recovered member','${email}',true);
    INSERT INTO organization (id,name,slug,created_at)
      VALUES ('recovery-workspace','Recovered workspace','recovered-workspace',now()),
             ('other-workspace','Other workspace','other-workspace',now());
    INSERT INTO member (id,organization_id,user_id,role,created_at)
      VALUES ('recovery-member','recovery-workspace','recovery-user','member',now());
    INSERT INTO workspace_group (id,workspace_id,name,is_default,version)
      VALUES ('everyone','recovery-workspace','Everyone',true,1),
             ('recovery-group','recovery-workspace','Recovery responders',false,4),
             ('other-group','other-workspace','Other responders',false,1);
    INSERT INTO group_membership (workspace_id,group_id,member_id)
      VALUES ('recovery-workspace','recovery-group','recovery-member');
    INSERT INTO service (id,workspace_id,name,description,version)
      VALUES ('recovery-service','recovery-workspace','Recovered API','Synthetic service evidence',7),
             ('other-service','other-workspace','Other API','Synthetic ownership fixture',1);
    INSERT INTO service_access_group (workspace_id,service_id,group_id)
      VALUES ('recovery-workspace','recovery-service','recovery-group');
    INSERT INTO service_repository (id,service_id,url)
      VALUES ('recovery-link','recovery-service','https://github.com/example/recovery-fixture');
    INSERT INTO finding (id,service_id,title,description,severity,status,remediation_notes,version,created_by,updated_by)
      VALUES ('recovery-finding','recovery-service','Recovered dependency alert','Synthetic vulnerability evidence','high','triaged','Retained local remediation notes',9,'recovery-user','recovery-user');
    INSERT INTO finding_reference (id,finding_id,url)
      VALUES ('recovery-reference','recovery-finding','https://example.test/advisory');
  `);
  await pool.query(
    "INSERT INTO account (id,account_id,provider_id,user_id,password,updated_at) VALUES ('recovery-account','recovery-user','credential','recovery-user',$1,now())",
    [await hashPassword(password)],
  );
}

async function assertCore(pool: Pool) {
  expect((await pool.query(`
    SELECT s.version AS service_version,f.version AS finding_version,
      f.status,f.description,f.remediation_notes,f.created_by,f.updated_by,g.version AS group_version,
      a.provider_id,(a.password IS NOT NULL) AS has_password,u.email_verified,
      r.url AS reference_url
    FROM service s JOIN finding f ON f.service_id=s.id
    JOIN service_access_group ag ON ag.service_id=s.id
    JOIN workspace_group g ON g.id=ag.group_id
    JOIN group_membership gm ON gm.group_id=g.id
    JOIN member m ON m.id=gm.member_id JOIN "user" u ON u.id=m.user_id
    JOIN account a ON a.user_id=u.id
    JOIN finding_reference r ON r.finding_id=f.id
    WHERE f.id='recovery-finding' AND m.role='member'
  `)).rows).toEqual([{
    service_version: 7, finding_version: 9, status: "triaged",
    description: "Synthetic vulnerability evidence", remediation_notes: "Retained local remediation notes",
    created_by: "recovery-user", updated_by: "recovery-user", group_version: 4,
    provider_id: "credential", has_password: true, email_verified: true,
    reference_url: "https://example.test/advisory",
  }]);
  expect((await pool.query("SELECT full_name FROM users")).rows).toEqual([{ full_name: "Legacy scaffold account" }]);
  // Ownership foreign keys must still reject a grant across workspaces after restore.
  await expect(pool.query(`
    INSERT INTO service_access_group (workspace_id,service_id,group_id)
    VALUES ('recovery-workspace','recovery-service','other-group')
  `)).rejects.toMatchObject({ code: "23503" });
  await expect(pool.query("UPDATE finding SET version=0 WHERE id='recovery-finding'")).rejects.toMatchObject({ code: "23514" });
}

async function history(pool: Pool) {
  return (await pool.query("SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at")).rows;
}

const digest = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex");

test("a historical custom backup restores before the real current migration upgrades it", async () => {
  test.setTimeout(90_000);
  const sandbox = await recoverySandbox();
  try {
    const source = await sandbox.database();
    const target = await sandbox.database();
    await migrateRecovery(source.pool, sandbox.directory, 4);
    await seedCore(source.pool);
    const oldHistory = await history(source.pool);
    expect(oldHistory).toHaveLength(5);
    expect((await source.pool.query("SELECT to_regclass('public.finding_source') AS table_name")).rows[0].table_name).toBeNull();
    const archive = await sandbox.archive(source.url, target.url);
    expect((await stat(archive)).mode & 0o777).toBe(0o600);
    expect((await stat(sandbox.directory)).mode & 0o777).toBe(0o700);
    const checksum = await digest(archive);
    expect(await history(target.pool)).toEqual(oldHistory);
    await assertCore(target.pool);
    await migrateRecovery(target.pool, sandbox.directory);
    const upgradedHistory = await history(target.pool);
    expect(upgradedHistory).toHaveLength(6);
    expect(upgradedHistory.slice(0, 5)).toEqual(oldHistory);
    await assertCore(target.pool);
    expect((await target.pool.query("SELECT count(*)::int AS count FROM finding_source")).rows[0].count).toBe(0);
    await expect(target.pool.query(`
      INSERT INTO workspace_integration (id,workspace_id,app_id,installation_id,account_id,account_login,account_type)
      VALUES ('orphan','missing-workspace','123','456','789','example','User')
    `)).rejects.toMatchObject({ code: "23503" });
    await migrateRecovery(target.pool, sandbox.directory);
    expect(await history(target.pool)).toEqual(upgradedHistory);
    expect(await digest(archive)).toBe(checksum);
  } finally { await sandbox.close(); }
});

test("a current backup recovers evidence and a working member login after scratch containment", async ({ browser }) => {
  test.setTimeout(90_000);
  const sandbox = await recoverySandbox();
  let server: Awaited<ReturnType<typeof recoveredServer>> | undefined;
  let context: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    const source = await sandbox.database();
    const target = await sandbox.database();
    await migrateRecovery(source.pool, sandbox.directory);
    await seedCore(source.pool);
    await source.pool.query(`
      INSERT INTO session (id,expires_at,token,updated_at,user_id,active_organization_id)
        VALUES ('old-session',now()+interval '1 day','synthetic-old-token',now(),'recovery-user','recovery-workspace');
      INSERT INTO verification (id,identifier,value,expires_at)
        VALUES ('old-verification','synthetic-reset','synthetic-reset-token',now()+interval '1 hour');
      INSERT INTO workspace_integration (id,workspace_id,app_id,installation_id,account_id,account_login,account_type,version)
        VALUES ('recovery-integration','recovery-workspace','123','456','789','example','Organization',3);
      INSERT INTO integration_repository (id,workspace_id,integration_id,service_id,repository_link_id,repository_id,full_name,version,lease_token,lease_expires_at,last_success_at)
        VALUES ('recovery-mapping','recovery-workspace','recovery-integration','recovery-service','recovery-link','987','example/recovery-fixture',5,'synthetic-active-lease',now()+interval '1 hour',now());
      INSERT INTO finding_source (finding_id,workspace_id,service_id,repository_id,alert_number,state,upstream_created_at,upstream_updated_at,package_name,ecosystem,manifest_path,ghsa_id,cve_id,vulnerable_range,patched_version,summary,severity,url)
        VALUES ('recovery-finding','recovery-workspace','recovery-service','987',12,'fixed','2026-01-01','2026-02-01','example-package','npm','package-lock.json','GHSA-aaaa-bbbb-cccc','CVE-2026-12345','<2.0.0','2.0.0','Retained upstream summary','high','https://github.com/example/recovery-fixture/security/dependabot/12');
    `);
    const archive = await sandbox.archive(source.url, target.url);
    const checksum = await digest(archive);
    expect(await history(target.pool)).toEqual(await history(source.pool));
    expect((await target.pool.query("SELECT token FROM session")).rows).toEqual([{ token: "synthetic-old-token" }]);
    expect((await target.pool.query("SELECT value FROM verification")).rows).toEqual([{ value: "synthetic-reset-token" }]);
    expect((await target.pool.query("SELECT enabled,lease_token FROM integration_repository")).rows).toEqual([{ enabled: true, lease_token: "synthetic-active-lease" }]);
    // Contain only the disposable restored copy before starting its app. The dump
    // and source remain unchanged, and no integration worker is started.
    await target.pool.query(`
      BEGIN;
      DELETE FROM session;
      DELETE FROM verification;
      UPDATE workspace_integration SET enabled=false,version=version+1;
      UPDATE integration_repository SET enabled=false,version=version+1,lease_token=NULL,lease_expires_at=NULL;
      COMMIT;
    `);
    await assertCore(target.pool);
    expect((await target.pool.query("SELECT count(*)::int AS count FROM session UNION ALL SELECT count(*)::int FROM verification")).rows).toEqual([{ count: 0 }, { count: 0 }]);
    expect((await target.pool.query(`
      SELECT i.enabled AS integration_enabled,i.version AS integration_version,
        r.enabled AS mapping_enabled,r.version AS mapping_version,r.lease_token,r.lease_expires_at,
        (r.last_success_at IS NOT NULL) AS has_sync_history,
        f.repository_id,f.alert_number,f.state,f.package_name,f.ghsa_id,f.cve_id,f.summary
      FROM workspace_integration i JOIN integration_repository r ON r.integration_id=i.id
      JOIN finding_source f ON f.repository_id=r.repository_id
    `)).rows).toEqual([{
      integration_enabled: false, integration_version: 4, mapping_enabled: false, mapping_version: 6,
      lease_token: null, lease_expires_at: null, has_sync_history: true,
      repository_id: "987", alert_number: 12, state: "fixed", package_name: "example-package",
      ghsa_id: "GHSA-aaaa-bbbb-cccc", cve_id: "CVE-2026-12345", summary: "Retained upstream summary",
    }]);
    await expect(target.pool.query("UPDATE finding_source SET workspace_id='other-workspace' WHERE finding_id='recovery-finding'")).rejects.toMatchObject({ code: "23503" });
    server = await recoveredServer(target.url);
    context = await browser.newContext({ baseURL: server.origin });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/u);
    await page.goto("/w/recovered-workspace");
    await expect(page.getByRole("heading", { name: "Recovered workspace", exact: true })).toBeVisible();
    await page.goto("/w/recovered-workspace/services/recovery-service/findings/recovery-finding");
    await expect(page.getByRole("heading", { name: "Recovered dependency alert", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dependabot source", exact: true })).toBeVisible();
    await expect(page.getByText("Retained local remediation notes", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "View Dependabot alert on GitHub", exact: true })).toHaveAttribute("href", "https://github.com/example/recovery-fixture/security/dependabot/12");
    // A member outside the other workspace still cannot access its service.
    await page.goto("/w/other-workspace/services/other-service");
    await expect(page.getByText("404", { exact: true })).toBeVisible();
    expect(await digest(archive)).toBe(checksum);
    expect((await source.pool.query("SELECT enabled,lease_token FROM integration_repository")).rows).toEqual([{ enabled: true, lease_token: "synthetic-active-lease" }]);
  } finally {
    try { await context?.close(); } finally {
      try { await server?.stop(); } finally { await sandbox.close(); }
    }
  }
});
