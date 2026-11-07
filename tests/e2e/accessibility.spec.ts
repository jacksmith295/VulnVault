import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";
import { Pool } from "pg";
import { test } from "./fixtures";
import { chooseTheme, verifiedAccount } from "./helpers";

async function audit(page: Page, state: string) {
  // Modal dialogs make the background inert, but it remains visually rendered.
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.locator('[aria-busy="true"]:visible')).toHaveCount(0);
  await expect(page).toHaveTitle(/^.+ \| VulnVault$/u);
  // Scan settled states. Opacity/colour transitions can produce transient axe results.
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    result.violations.map(({ id, description, nodes }) => ({
      id,
      description,
      targets: nodes.map((node) => ({
        target: node.target,
        detail: node.failureSummary,
      })),
    })),
    state,
  ).toEqual([]);
}

async function focusIndicator(control: Locator) {
  await control.focus();
  const indicator = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    const rgb = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    let background = [255, 255, 255, 255];
    const ancestors: Element[] = [];
    for (
      let parent = element.parentElement;
      parent;
      parent = parent.parentElement
    )
      ancestors.unshift(parent);
    for (const parent of ancestors) {
      const color = rgb(getComputedStyle(parent).backgroundColor);
      background = color.map((value, i) =>
        i === 3
          ? 255
          : (value * color[3]) / 255 + background[i] * (1 - color[3] / 255),
      );
    }
    const luminance = (color: number[]) =>
      color
        .slice(0, 3)
        .map((value) => {
          const channel = value / 255;
          return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
        })
        .reduce(
          (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
          0,
        );
    const outline = rgb(style.outlineColor);
    const foreground = luminance(
      outline.map((value, i) =>
        i === 3
          ? 255
          : (value * outline[3]) / 255 + background[i] * (1 - outline[3] / 255),
      ),
    );
    const backdrop = luminance(background);
    return {
      width: parseFloat(style.outlineWidth),
      offset: parseFloat(style.outlineOffset),
      style: style.outlineStyle,
      contrast:
        (Math.max(foreground, backdrop) + 0.05) /
        (Math.min(foreground, backdrop) + 0.05),
    };
  });
  expect(indicator.style).toBe("solid");
  expect(indicator.width).toBeGreaterThanOrEqual(2);
  expect(indicator.offset).toBeGreaterThanOrEqual(2);
  expect(indicator.contrast).toBeGreaterThanOrEqual(3);
}

async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}

async function skipToMain(page: Page) {
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
}

for (const theme of ["Light", "Dark"] as const) {
  test(`public pages and validation are accessible in ${theme.toLowerCase()} mode`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/login");
    await chooseTheme(page, theme);
    for (const route of [
      "/login",
      "/register",
      "/forgot-password",
      "/verify-email",
      "/reset-password",
      "/reset-password?token=accessibility-audit",
      "/missing-accessibility-page",
    ]) {
      await page.goto(route);
      await audit(page, `${theme}: ${route}`);
      await expect(
        page.getByRole("heading", { name: "404", exact: true }),
      ).toHaveCount(route.includes("missing") ? 1 : 0);
    }

    await page.goto("/login");
    await skipToMain(page);
    for (const control of [
      page.getByLabel("Email", { exact: true }),
      page.getByRole("link", { name: "Register", exact: true }),
      page.getByRole("button", { name: "Login", exact: true }),
    ])
      await focusIndicator(control);
    await page.emulateMedia({ forcedColors: "active" });
    await focusIndicator(page.getByLabel("Email", { exact: true }));
    await page.emulateMedia({ forcedColors: "none" });
    const themeButton = page.getByRole("button", {
      name: "Theme",
      exact: true,
    });
    await themeButton.focus();
    await themeButton.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await audit(page, `${theme}: open theme menu`);
    await page.keyboard.press("Escape");
    await expect(themeButton).toBeFocused();

    await page.getByLabel("Email", { exact: true }).fill("audit@example.com");
    const password = page.getByLabel("Password", { exact: true });
    await password.fill("short");
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await expect(password).toHaveAttribute("aria-invalid", "true");
    await expect(password).toHaveAccessibleDescription(
      "Password must be at least 8 characters",
    );
    await expect(password).toBeFocused();
    await audit(page, `${theme}: associated validation error`);
    await page
      .getByRole("button", { name: "Show password", exact: true })
      .click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue("short");
  });

  test(`authenticated surfaces and overlays are accessible in ${theme.toLowerCase()} mode`, async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const owner = await verifiedAccount(context);
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const workspaceId = randomUUID();
    const slug = `a11y-${randomUUID()}`;
    const serviceId = randomUUID();
    const groupId = randomUUID();
    const findingId = randomUUID();
    const path = `/w/${slug}`;
    const servicePath = `${path}/services/${serviceId}`;
    const findingPath = `${servicePath}/findings/${findingId}`;
    try {
      await pool.query(
        "INSERT INTO organization (id,name,slug,created_at) VALUES ($1,'Accessibility workspace',$2,now())",
        [workspaceId, slug],
      );
      await pool.query(
        "INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,'owner',now())",
        [randomUUID(), workspaceId, owner.id],
      );
      await pool.query(
        "INSERT INTO service (id,workspace_id,name) VALUES ($1,$2,'Audited API')",
        [serviceId, workspaceId],
      );
      await pool.query(
        "INSERT INTO workspace_group (id,workspace_id,name) VALUES ($1,$2,'Security reviewers')",
        [groupId, workspaceId],
      );
      await pool.query(
        "INSERT INTO workspace_group (id,workspace_id,name,is_default) VALUES ($1,$2,'Everyone',true)",
        [randomUUID(), workspaceId],
      );
      await pool.query(
        "INSERT INTO finding (id,service_id,title,description,severity,status) VALUES ($1,$2,'Audited vulnerability','An example vulnerability for accessibility checks.','high','new')",
        [findingId, serviceId],
      );
      await pool.query(
        "INSERT INTO workspace_integration (id,workspace_id,app_id,installation_id,account_id,account_login,account_type) VALUES ($1,$2,'123','456','789','audit-example','User')",
        [randomUUID(), workspaceId],
      );

      await page.goto(path);
      await chooseTheme(page, theme);
      for (const route of [
        "/workspaces",
        "/workspaces/new",
        path,
        `${path}/services`,
        `${path}/services/new`,
        servicePath,
        `${servicePath}/edit`,
        `${servicePath}/access`,
        `${servicePath}/findings/new`,
        findingPath,
        `${findingPath}/edit`,
        `${path}/groups`,
        `${path}/groups/${groupId}`,
        `${path}/integrations`,
        `${servicePath}/integrations`,
        `${path}/services/missing`,
      ]) {
        await page.goto(route);
        await audit(page, `${theme}: ${route}`);
        await expect(
          page.getByRole("heading", { name: "404", exact: true }),
        ).toHaveCount(route.includes("missing") ? 1 : 0);
      }

      await page.goto(`${servicePath}/access`);
      await page.keyboard.press("Tab");
      const mode = page.getByRole("combobox", {
        name: "Access mode",
        exact: true,
      });
      await focusIndicator(mode);
      await mode.press("ArrowDown");
      await page
        .getByRole("option", { name: "Selected groups", exact: true })
        .click();
      const checkbox = page.getByRole("checkbox", {
        name: "Security reviewers",
        exact: true,
      });
      await page.keyboard.press("Tab");
      await focusIndicator(checkbox);
      expect(
        await checkbox.evaluate(
          (element) => element.closest("label")!.getBoundingClientRect().height,
        ),
      ).toBeGreaterThanOrEqual(24);
      const uncheckedBackground = await checkbox.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      await checkbox.check();
      await expect(checkbox).toBeChecked();
      await expect
        .poll(() => checkbox.evaluate((element) => getComputedStyle(element).backgroundColor))
        .not.toBe(uncheckedBackground);
      await audit(page, `${theme}: selected group checkboxes`);

      await page.goto(path);
      await skipToMain(page);
      await expect(
        page.getByRole("link", { name: "Audited vulnerability", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: test.info().outputPath(`board-${theme.toLowerCase()}.png`),
        fullPage: true,
      });
      const workspace = page.getByRole("button", {
        name: "Switch workspace: Accessibility workspace",
        exact: true,
      });
      await workspace.focus();
      await workspace.press("Enter");
      await expect(page.getByRole("menu")).toBeVisible();
      await audit(page, `${theme}: workspace menu`);
      await page.keyboard.press("Escape");
      await expect(workspace).toBeFocused();
      const status = page.getByRole("button", {
        name: "Change status for Audited vulnerability",
        exact: true,
      });
      await status.focus();
      await status.press("Enter");
      await expect(
        page.getByRole("menuitem", { name: "Triaged", exact: true }),
      ).toBeVisible();
      const currentStatus = page.getByRole("menuitem", { name: "New", exact: true });
      await expect(currentStatus).toBeDisabled();
      await expect(currentStatus).toHaveCSS("opacity", "0.5");
      await audit(page, `${theme}: finding status menu`);
      await page.keyboard.press("Escape");
      await expect(status).toBeFocused();

      await page.setViewportSize({ width: 320, height: 800 });
      await noHorizontalOverflow(page);
      const activeTab = page.getByRole("tab", { name: "New (1)", exact: true });
      await expect(activeTab).toHaveAttribute("aria-selected", "true");
      const inactiveTab = page.getByRole("tab", { name: "Triaged (0)", exact: true });
      const inactiveBackground = await inactiveTab.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      expect(await activeTab.evaluate((element) => getComputedStyle(element).backgroundColor))
        .not.toBe(inactiveBackground);
      await page.screenshot({
        path: test.info().outputPath(`board-mobile-${theme.toLowerCase()}.png`),
        fullPage: true,
      });
      const filters = page.getByRole("button", { name: /^Filters/u });
      await filters.focus();
      await filters.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Finding filters" });
      await expect(dialog).toBeVisible();
      await audit(page, `${theme}: mobile filter drawer`);
      await dialog.evaluate(async (element) => {
        await Promise.all(
          element
            .getAnimations()
            .map((animation) => animation.finished.catch(() => {})),
        );
      });
      await page.screenshot({
        path: test
          .info()
          .outputPath(`filters-mobile-${theme.toLowerCase()}.png`),
        fullPage: true,
      });
      const severity = dialog.getByRole("combobox", {
        name: "Severity",
        exact: true,
      });
      await severity.focus();
      await severity.press("ArrowDown");
      await expect(page.getByRole("listbox")).toBeVisible();
      await expect(page.locator('[role="option"][data-highlighted]')).toHaveCSS(
        "outline-style",
        "solid",
      );
      await audit(page, `${theme}: nested select`);
      await page.keyboard.press("Escape");
      await expect(severity).toBeFocused();
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(filters).toBeFocused();

      await page.goto(`${path}?status=new`);
      const move = page.getByRole("button", {
        name: "Change status for Audited vulnerability",
        exact: true,
      });
      await move.focus();
      await move.press("Enter");
      await page
        .getByRole("menuitem", { name: "Triaged", exact: true })
        .press("Enter");
      const moved = page
        .getByRole("status")
        .filter({ hasText: "Audited vulnerability moved to Triaged." });
      await expect(moved).toBeVisible();
      await expect(moved).toHaveCSS("animation-name", "feedback");
      await expect(
        page.getByRole("link", { name: "Audited vulnerability", exact: true }),
      ).toHaveCount(0);
      await expect(moved).toBeFocused();
      await audit(
        page,
        `${theme}: status feedback after card leaves filtered board`,
      );

      await page.goto(`${servicePath}/edit`);
      await page.keyboard.press("Tab");
      await focusIndicator(page.getByLabel("Description", { exact: true }));
      await page.keyboard.press("Tab");
      const focusedTop = await page.evaluate(
        () => document.activeElement!.getBoundingClientRect().top,
      );
      const headerBottom = await page
        .locator("header")
        .first()
        .evaluate((header) => header.getBoundingClientRect().bottom);
      expect(focusedTop).toBeGreaterThanOrEqual(headerBottom);
      await page
        .getByLabel("Name", { exact: true })
        .fill("Unsaved accessible draft");
      await page.addStyleTag({
        content: `
        html { font-size: 200% !important; }
        * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; }
        p { margin-bottom: 2em !important; }
      `,
      });
      await noHorizontalOverflow(page);
      await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
        "Unsaved accessible draft",
      );
      await expect(
        page.getByRole("button", { name: "Save changes", exact: true }),
      ).toBeVisible();
      await audit(page, `${theme}: 320px with enlarged and spaced text`);
    } finally {
      // Only this test's disposable records are removed; application deletion remains unavailable.
      await pool.query(
        "DELETE FROM workspace_integration WHERE workspace_id=$1",
        [workspaceId],
      );
      await pool.query("DELETE FROM finding WHERE service_id=$1", [serviceId]);
      await pool.query("DELETE FROM service WHERE workspace_id=$1", [
        workspaceId,
      ]);
      await pool.query("DELETE FROM organization WHERE id=$1", [workspaceId]);
      await pool.query('DELETE FROM "user" WHERE id=$1', [owner.id]);
      await pool.end();
    }
  });
}
