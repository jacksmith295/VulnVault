import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { test } from "./fixtures";
import { chooseTheme, origin, verifiedAccount } from "./helpers";

async function fitsViewport(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("routine pages use bounded content and wrap long text at mobile widths", async ({
  page,
  context,
}) => {
  const owner = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const slug = `responsive-${randomUUID()}`;
  const serviceId = randomUUID();
  const groupId = randomUUID();
  const findingId = randomUUID();
  let workspaceId: string | undefined;
  const longName = "Project".repeat(14);
  const longURL = `https://example.com/${"advisory".repeat(35)}`;
  try {
    await page.goto("/workspaces/new");
    await page.getByLabel("Workspace name", { exact: true }).fill(longName);
    await page.getByLabel("URL slug", { exact: true }).fill(slug);
    await page
      .getByRole("button", { name: "Create workspace", exact: true })
      .click();
    await expect(page).toHaveURL(`${origin}/w/${slug}`);
    workspaceId = (
      await pool.query("SELECT id FROM organization WHERE slug=$1", [slug])
    ).rows[0].id;
    await pool.query('UPDATE "user" SET name=$1 WHERE id=$2', [
      longName,
      owner.id,
    ]);
    await pool.query(
      "INSERT INTO service (id,workspace_id,name,description) VALUES ($1,$2,$3,$4)",
      [
        serviceId,
        workspaceId,
        longName,
        "Readable service description. ".repeat(50),
      ],
    );
    await pool.query(
      "INSERT INTO service_repository (id,service_id,url) VALUES ($1,$2,$3)",
      [randomUUID(), serviceId, longURL],
    );
    await pool.query(
      "INSERT INTO workspace_group (id,workspace_id,name,is_default) VALUES ($1,$2,$3,false)",
      [groupId, workspaceId, longName],
    );
    await pool.query(
      "INSERT INTO finding (id,service_id,title,description,severity,status,remediation_notes) VALUES ($1,$2,$3,$4,'high','new',$4)",
      [
        findingId,
        serviceId,
        longName,
        "Readable remediation text. ".repeat(50),
      ],
    );
    await pool.query(
      "INSERT INTO finding_reference (id,finding_id,url) VALUES ($1,$2,$3)",
      [randomUUID(), findingId, longURL],
    );
    const base = `/w/${slug}`;
    const routes = [
      "/workspaces",
      "/workspaces/new",
      `${base}/groups`,
      `${base}/groups/${groupId}`,
      `${base}/services`,
      `${base}/services/new`,
      `${base}/services/${serviceId}`,
      `${base}/services/${serviceId}/edit`,
      `${base}/services/${serviceId}/access`,
      `${base}/services/${serviceId}/findings/${findingId}`,
      `${base}/services/${serviceId}/findings/${findingId}/edit`,
    ];
    await page.setViewportSize({ width: 2560, height: 1440 });
    await page.goto(`${base}/groups`);
    await expect(page.getByRole("main")).toBeVisible();
    expect(
      (await page.getByRole("main").boundingBox())!.width,
    ).toBeLessThanOrEqual(1152);
    const cards = page.getByRole("main").getByRole("listitem");
    for (const card of await cards.all())
      expect((await card.boundingBox())!.width).toBeLessThanOrEqual(550);
    // Sections are located by their heading so their semantic shape can stay shared.
    const sectionWidth = await page
      .getByRole("heading", { name: "Create group", exact: true })
      .evaluate(
        (heading) => heading.closest("section")!.getBoundingClientRect().width,
      );
    expect(sectionWidth).toBeLessThanOrEqual(640);
    await page.screenshot({
      path: test.info().outputPath("groups-desktop-light.png"),
      fullPage: true,
    });
    await page.goto(`${base}/services/${serviceId}/edit`);
    expect(
      (await page.getByRole("main").boundingBox())!.width,
    ).toBeLessThanOrEqual(640);
    await page.goto(`${base}/services/${serviceId}/findings/${findingId}`);
    expect(
      (await page.getByRole("main").boundingBox())!.width,
    ).toBeLessThanOrEqual(896);

    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await chooseTheme(page, width === 390 ? "Dark" : "Light");
      for (const route of routes) {
        await page.goto(route);
        await expect(page.getByRole("main")).toBeVisible();
        await fitsViewport(page);
      }
      await page.goto(base);
      await page.getByRole("button", { name: /^Filters \(/u }).click();
      for (const label of ["Group", "Service"]) {
        const control = page.getByRole("combobox", {
          name: label,
          exact: true,
        });
        await control.click();
        await expect(control).toHaveAttribute("aria-expanded", "true");
        const listId = await control.getAttribute("aria-controls");
        expect(listId).toBeTruthy();
        // A previous popup can still be fading out; inspect this control's active list.
        const option = page.locator(`id=${listId}`).getByRole("option", {
          name: longName,
          exact: true,
        });
        await expect(option).toBeVisible();
        const bounds = await option.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        await fitsViewport(page);
        await page.keyboard.press("Escape");
        await expect(
          page.getByRole("dialog", { name: "Finding filters", exact: true }),
        ).toBeVisible();
      }
      await page.keyboard.press("Escape");
      await page.goto(`${base}/groups`);
      await page.screenshot({
        path: test.info().outputPath(`groups-${width}.png`),
        fullPage: true,
      });
    }
  } finally {
    if (workspaceId) {
      await pool.query(
        "DELETE FROM finding WHERE service_id IN (SELECT id FROM service WHERE workspace_id=$1)",
        [workspaceId],
      );
      await pool.query("DELETE FROM service WHERE workspace_id=$1", [
        workspaceId,
      ]);
      await pool.query("DELETE FROM organization WHERE id=$1", [workspaceId]);
    }
    await pool.query('DELETE FROM "user" WHERE id=$1', [owner.id]);
    await pool.end();
  }
});
