import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type BrowserContext } from "@playwright/test";
import { Pool } from "pg";
import { test } from "./fixtures";
import { chooseTheme, origin, verifiedAccount } from "./helpers";

async function fixture(page: Page, context: BrowserContext) {
  const account = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const slug = `discovery-${randomUUID()}`;
  const serviceId = randomUUID();
  await page.goto("/workspaces/new");
  await page.getByLabel("Workspace name", { exact: true }).fill("Discovery workspace");
  await page.getByLabel("URL slug", { exact: true }).fill(slug);
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/w/${slug}`);
  const workspaceId = (await pool.query("SELECT id FROM organization WHERE slug=$1", [slug])).rows[0].id as string;
  await pool.query("INSERT INTO service (id,workspace_id,name) VALUES ($1,$2,'Discovery API')", [serviceId, workspaceId]);
  await pool.query(`
    INSERT INTO finding (id,service_id,title,description,severity,status,created_at)
    SELECT $1 || '-manual-' || n,$1,'Manual row ' || lpad(n::text,2,'0'),'Synthetic evidence','low','new',
      timestamp '2026-01-01' + n * interval '1 second'
    FROM generate_series(1,25) n
  `, [serviceId]);
  const states = ["open", "fixed", "dismissed", "auto_dismissed"];
  for (const [index, state] of states.entries()) {
    const id = `${serviceId}-import-${index}`;
    await pool.query("INSERT INTO finding (id,service_id,title,description,severity,status,created_at) VALUES ($1,$2,$3,'Synthetic imported evidence','high','triaged',timestamp '2026-01-02' + $4 * interval '1 second')", [id, serviceId, `Imported alert ${index}`, index]);
    await pool.query(`
      INSERT INTO finding_source (finding_id,workspace_id,service_id,repository_id,alert_number,state,
        upstream_created_at,upstream_updated_at,package_name,ecosystem,manifest_path,ghsa_id,cve_id,
        vulnerable_range,summary,severity,url)
      VALUES ($1,$2,$3,'987',$4,$5,now(),now(),$6,'npm','package-lock.json',$7,$8,'<2','Synthetic summary','high','https://example.test/alert')
    `, [id, workspaceId, serviceId, index + 1, state, `vault-library-${index}`, `GHSA-test-abcd-000${index}`, `CVE-2026-120${index}`]);
  }
  return {
    pool, slug, serviceId, workspaceId, userId: account.id,
    path: `/w/${slug}/services/${serviceId}`,
    async close() {
      try {
        await pool.query("DELETE FROM finding WHERE service_id=$1", [serviceId]);
        await pool.query("DELETE FROM service WHERE id=$1", [serviceId]);
        await pool.query("DELETE FROM organization WHERE id=$1", [workspaceId]);
        await pool.query('DELETE FROM "user" WHERE id=$1', [account.id]);
      } finally { await pool.end(); }
    },
  };
}

async function select(page: Page, name: string, value: string) {
  await page.getByRole("combobox", { name, exact: true }).click();
  await page.getByRole("option", { name: value, exact: true }).click();
  await expect(page.getByRole("listbox")).not.toBeVisible();
}
const apply = (page: Page) => page.getByRole("button", { name: "Apply filters", exact: true }).click();
const search = (page: Page) => page.getByRole("searchbox", { name: "Search findings", exact: true });

test("service discovery bounds rows and preserves controls and drafts while filtered results stream", async ({ page, context }) => {
  const data = await fixture(page, context);
  const blocker = await data.pool.connect();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(data.path);
    const rows = page.locator(`a[href^="${data.path}/findings/"]:not([href$="/new"])`);
    await expect(rows).toHaveCount(20);
    await expect(page.getByRole("link", { name: "Manual row 01", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Load more findings", exact: true }).click();
    await expect(rows).toHaveCount(29);
    await expect(page.getByRole("link", { name: "Manual row 01", exact: true })).toBeVisible();
    await search(page).evaluate((element) => element.setAttribute("data-persistent-search", "original"));
    await search(page).fill("cve-2026-1201");
    await blocker.query("BEGIN");
    await blocker.query("SET LOCAL idle_in_transaction_session_timeout='20s'");
    await blocker.query("LOCK TABLE finding IN ACCESS EXCLUSIVE MODE");
    await apply(page);
    await expect(page.getByRole("status", { name: "Loading service findings", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Discovery API", exact: true })).toBeVisible();
    await expect(search(page)).toHaveAttribute("data-persistent-search", "original");
    await search(page).fill("unapplied draft");
    await blocker.query("COMMIT");
    await expect(page.getByRole("link", { name: "Imported alert 1", exact: true })).toBeVisible();
    await expect(rows).toHaveCount(1);
    await expect(search(page)).toHaveValue("unapplied draft");
    await expect(page).toHaveURL(/q=cve-2026-1201/u);
    await expect(search(page)).toHaveAttribute("data-persistent-search", "original");
    await page.getByRole("link", { name: "Clear filters", exact: true }).click();
    await expect(rows).toHaveCount(20);
    await expect(search(page)).toHaveValue("");
    await page.goBack();
    await expect(search(page)).toHaveValue("cve-2026-1201");
    await expect(rows).toHaveCount(1);
    await page.goForward();
    await expect(search(page)).toHaveValue("");
    await expect(rows).toHaveCount(20);
    // Discovery reads must leave upstream facts and local decisions unchanged.
    expect((await data.pool.query("SELECT status,version FROM finding WHERE id=$1", [`${data.serviceId}-import-1`])).rows).toEqual([{ status: "triaged", version: 1 }]);
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", await page.locator("body").evaluate((element) => element.clientWidth));
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: test.info().outputPath("service-discovery-1440.png") });
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await data.close();
  }
});

test("board and service source filters share mobile drawer behaviour in both themes", async ({ page, context }) => {
  const data = await fixture(page, context);
  try {
    for (const theme of ["Light", "Dark"] as const) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/w/${data.slug}`);
      await chooseTheme(page, theme);
      await page.getByRole("button", { name: /^Filters \(/u }).click();
      await search(page).fill("VAULT-LIBRARY-3");
      await select(page, "Source", "Dependabot");
      await select(page, "Upstream state", "Automatically dismissed");
      await apply(page);
      await expect(page.getByRole("dialog")).not.toBeVisible();
      // The imported alert retains its local Triaged status.
      await page.getByRole("tab", { name: "Triaged (1)", exact: true }).click();
      await expect(page.getByRole("link", { name: "Imported alert 3", exact: true })).toBeVisible();
      await page.goto(`${data.path}?source=github_dependabot&upstream=auto_dismissed`);
      await expect(page.getByRole("link", { name: "Imported alert 3", exact: true })).toBeVisible();
      await page.getByRole("button", { name: /^Filters \(/u }).click();
      await expect(page.getByRole("combobox", { name: "Source", exact: true })).toContainText("Dependabot");
      await select(page, "Source", "Manual");
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await apply(page);
      await expect(page.getByRole("link", { name: "Imported alert 3", exact: true })).toHaveCount(0);
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await expect(page.getByText(/upstream state.*imported/iu).filter({ visible: true })).toBeVisible();
      await page.getByRole("button", { name: /^Filters \(/u }).click();
      await page.getByRole("link", { name: "Clear filters", exact: true }).click();
      await expect(page.getByRole("link", { name: "Imported alert 3", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`service-discovery-${theme.toLowerCase()}-390.png`) });
    }
  } finally { await data.close(); }
});


test("service paging discards superseded responses and evicts rows after access revocation", async ({ page, context, browser }) => {
  const data = await fixture(page, context);
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let received!: () => void;
  const intercepted = new Promise<void>((resolve) => { received = resolve; });
  let finished!: () => void;
  const completed = new Promise<void>((resolve) => { finished = resolve; });
  let pagingUrl = "";
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(data.path);
    await page.route(`**/services/${data.serviceId}/findings/more?**`, async (route) => {
      pagingUrl = route.request().url();
      const response = await route.fetch();
      received();
      await hold;
      try { await route.fulfill({ response }); } finally { finished(); }
    }, { times: 1 });
    await page.getByRole("button", { name: "Load more findings", exact: true }).click();
    await intercepted;
    await search(page).fill("CVE-2026-1201");
    await apply(page);
    await expect(page.getByRole("link", { name: "Imported alert 1", exact: true })).toBeVisible();
    release();
    await completed;
    await expect(page.getByRole("link", { name: "Manual row 01", exact: true })).toHaveCount(0);
    // Exercise the real route boundary as well as its parser unit tests.
    for (const suffix of ["&cursor=duplicate", "&scope=duplicate", "&q=&q=", "&unexpected=x"]) {
      const response = await context.request.get(pagingUrl + suffix);
      expect(response.headers()["cache-control"]).toBe("private, no-store");
      expect(await response.json()).toEqual({ reset: true });
    }
    const anonymous = await browser.newContext();
    try {
      const denied = await anonymous.request.get(pagingUrl, { maxRedirects: 0 });
      expect(denied.status()).toBe(307);
      expect(denied.headers().location).toContain("/login");
    } finally { await anonymous.close(); }
    await page.getByRole("link", { name: "Clear filters", exact: true }).click();
    await expect(page.getByRole("link", { name: "Manual row 25", exact: true })).toBeVisible();
    await data.pool.query("DELETE FROM member WHERE organization_id=$1 AND user_id=$2", [data.workspaceId, data.userId]);
    await page.getByRole("button", { name: "Load more findings", exact: true }).click();
    await expect(page.getByText("404", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Manual row 25", exact: true })).toHaveCount(0);
  } finally { release(); await data.close(); }
});
