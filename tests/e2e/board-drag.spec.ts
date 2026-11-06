import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";
import { Pool } from "pg";
import { test } from "./fixtures";
import { chooseTheme, origin, verifiedAccount } from "./helpers";

async function fixture(page: Page, pool: Pool) {
  const slug = `drag-${randomUUID()}`;
  await page.goto("/workspaces/new");
  await page.getByLabel("Workspace name", { exact: true }).fill("Drag board");
  await page.getByLabel("URL slug", { exact: true }).fill(slug);
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/w/${slug}$`, "u"));
  const workspace = (
    await pool.query("SELECT id FROM organization WHERE slug = $1", [slug])
  ).rows[0].id as string;
  const service = randomUUID();
  const archived = randomUUID();
  await pool.query(
    "INSERT INTO service (id,workspace_id,name,archived_at) VALUES ($1,$3,'Drag API',NULL),($2,$3,'Archived API',now())",
    [service, archived, workspace],
  );
  return { workspace, service, archived, path: `/w/${slug}` };
}

async function finding(
  pool: Pool,
  service: string,
  title: string,
  severity = "high",
) {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO finding (id,service_id,title,description,severity,status,remediation_notes) VALUES ($1,$2,$3,'Original evidence',$4,'new','Original remediation')",
    [id, service, title, severity],
  );
  return id;
}

async function cleanup(
  pool: Pool,
  data: Awaited<ReturnType<typeof fixture>>,
  user: string,
) {
  await pool.query(
    "DELETE FROM finding WHERE service_id IN (SELECT id FROM service WHERE workspace_id = $1)",
    [data.workspace],
  );
  await pool.query("DELETE FROM service WHERE workspace_id = $1", [
    data.workspace,
  ]);
  await pool.query("DELETE FROM organization WHERE id = $1", [data.workspace]);
  await pool.query('DELETE FROM "user" WHERE id = $1', [user]);
  await pool.end();
}

function handle(page: Page, title: string) {
  return page.getByRole("button", { name: `Move ${title}`, exact: true });
}
function target(page: Page, status: string, mobile = false) {
  return page.locator(
    `[data-drop-status="${status}"][data-drop-${mobile ? "mobile" : "desktop"}]`,
  );
}
async function center(locator: Locator) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  return {
    x: bounds!.x + bounds!.width / 2,
    y: bounds!.y + Math.min(bounds!.height / 2, 100),
  };
}
async function readyHandle(page: Page, title: string) {
  const control = handle(page, title);
  await expect(control).toBeEnabled();
  let previousPosition = "";
  let stableSamples = 0;
  // Refreshes and focus restoration can scroll the card after feedback appears.
  // Begin only when the actual enabled button remains unobstructed and stationary.
  await expect
    .poll(async () => {
      await control.scrollIntoViewIfNeeded();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          ),
      );
      const point = await center(control);
      const sample = await control.evaluate((element, point) => {
        const hit = document
          .elementFromPoint(point.x, point.y)
          ?.closest("button");
        return {
          ready: !(element as HTMLButtonElement).disabled && hit === element,
          position: `${point.x.toFixed(1)}:${point.y.toFixed(1)}`,
        };
      }, point);
      stableSamples =
        sample.ready && sample.position === previousPosition
          ? stableSamples + 1
          : 0;
      previousPosition = sample.position;
      return stableSamples;
    })
    .toBeGreaterThanOrEqual(3);
  return center(control);
}
async function startDrag(page: Page, title: string) {
  const start = await readyHandle(page, title);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 15, start.y + 15, { steps: 5 });
  await expect(
    page.locator('[data-dragging="true"]:not([inert]):not([inert] *)'),
  ).toHaveCount(1);
}
async function drop(page: Page, status: string) {
  const end = await center(target(page, status));
  await page.mouse.move(end.x, end.y, { steps: 15 });
  await page.mouse.up();
}
async function saved(pool: Pool, id: string) {
  return (
    await pool.query(
      "SELECT status,version,description,remediation_notes FROM finding WHERE id = $1",
      [id],
    )
  ).rows[0];
}

for (const motion of ["no-preference", "reduce"] as const) {
  test(`compact cards lift without a copy or gap and cancel safely with ${motion} motion`, async ({
    page,
    context,
  }) => {
    const owner = await verifiedAccount(context);
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const data = await fixture(page, pool);
    try {
      const siblingId = await finding(pool, data.service, "Compact sibling");
      const sourceId = await finding(pool, data.service, "Compact source");
      const longTitle =
        "A long finding title that wraps beside the compact actions without covering either control";
      const longId = await finding(pool, data.service, longTitle);
      await pool.query(
        "UPDATE finding SET created_at = CASE id WHEN $1 THEN '2026-01-03'::timestamp WHEN $2 THEN '2026-01-02'::timestamp ELSE '2026-01-01'::timestamp END WHERE id = ANY($3::text[])",
        [sourceId, siblingId, [sourceId, siblingId, longId]],
      );
      await page.emulateMedia({ reducedMotion: motion });
      // Hold sibling layout animations so intermediate geometry can be sampled
      // deterministically, rather than checking only classes or final positions.
      await page.addInitScript(() => {
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (keyframes, options) {
          const animation = animate.call(this, keyframes, options);
          const layout = Array.isArray(keyframes)
            ? keyframes.some(
                (frame) => "translate" in frame || "transform" in frame,
              )
            : keyframes &&
              ("translate" in keyframes || "transform" in keyframes);
          if (this.hasAttribute("data-board-card-id") && layout) {
            this.setAttribute("data-test-layout-animation", "true");
            animation.pause();
            animation.currentTime = 0;
          }
          return animation;
        };
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(data.path);
      const source = page.locator(`[data-board-card-id="${sourceId}"]`);
      const sibling = page.locator(`[data-board-card-id="${siblingId}"]`);
      const cards = page
        .getByRole("region", { name: "New findings", exact: true })
        .locator("[data-board-card-id]");
      const order = [sourceId, siblingId, longId];
      await expect(handle(page, "Compact source")).toBeEnabled();
      await expect(
        page.getByText(
          "Drag a finding to change its status, or use its menu.",
          { exact: true },
        ),
      ).toHaveCount(0);
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(source).toBeVisible();
        const bounds = await source.boundingBox();
        expect(bounds!.height).toBeLessThanOrEqual(125);
        for (const title of ["Compact source", longTitle]) {
          const menu = page.getByRole("button", {
            name: `Change status for ${title}`,
            exact: true,
          });
          const menuBounds = await menu.boundingBox();
          const handleBounds = await handle(page, title).boundingBox();
          expect(menuBounds!.width).toBeLessThanOrEqual(32);
          expect(menuBounds!.width).toBeGreaterThanOrEqual(24);
          expect(handleBounds!.width).toBeGreaterThanOrEqual(24);
          expect(handleBounds!.x + handleBounds!.width).toBeLessThanOrEqual(
            menuBounds!.x,
          );
          const fragments = await page
            .getByRole("link", { name: title, exact: true })
            .evaluate((link) => {
              const range = document.createRange();
              range.selectNodeContents(link);
              return [...range.getClientRects()].map((rect) => ({
                x: rect.x,
                y: rect.y,
                right: rect.right,
                bottom: rect.bottom,
              }));
            });
          for (const fragment of fragments) {
            if (
              fragment.y < handleBounds!.y + handleBounds!.height &&
              fragment.bottom > handleBounds!.y
            )
              expect(fragment.right).toBeLessThanOrEqual(handleBounds!.x);
          }
        }
      }
      const before = await source.boundingBox();
      const siblingBefore = await sibling.boundingBox();
      const original = await saved(pool, sourceId);
      await startDrag(page, "Compact source");
      await expect(source).toHaveCount(1);
      await expect(page.locator("[data-dnd-placeholder]")).toHaveCount(0);
      await expect(page.locator("[data-dnd-dragging]")).toHaveCount(1);
      await expect
        .poll(() =>
          cards.evaluateAll((elements) =>
            elements.map((element) =>
              element.getAttribute("data-board-card-id"),
            ),
          ),
        )
        .toEqual(order);
      if (motion === "no-preference") {
        await expect(sibling).toHaveAttribute(
          "data-test-layout-animation",
          "true",
        );
        const samples = await sibling.evaluate(async (element) => {
          const animation = element
            .getAnimations()
            .find((candidate) => candidate.playState === "paused")!;
          const duration = Number(
            animation.effect!.getComputedTiming().duration,
          );
          const positions: number[] = [];
          for (const fraction of [0.1, 0.9]) {
            animation.currentTime = duration * fraction;
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => resolve()),
            );
            positions.push(element.getBoundingClientRect().top);
          }
          animation.finish();
          return positions;
        });
        expect(samples[0]).toBeLessThan(siblingBefore!.y);
        expect(samples[1]).toBeGreaterThanOrEqual(before!.y - 1);
        expect(samples[0] - samples[1]).toBeGreaterThan(4);
      } else {
        await expect(sibling).not.toHaveAttribute(
          "data-test-layout-animation",
          "true",
        );
        expect(
          await sibling.evaluate((element) => element.getAnimations().length),
        ).toBe(0);
      }
      await expect
        .poll(async () => (await sibling.boundingBox())!.y)
        .toBeCloseTo(before!.y, 0);
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await expect(page.locator("[data-dnd-dragging]")).toHaveCount(0);
      await expect(handle(page, "Compact source")).toBeFocused();
      if (motion === "no-preference") {
        const returningTop = await sibling.evaluate(async (element) => {
          const animation = element
            .getAnimations()
            .find((candidate) => candidate.playState === "paused")!;
          animation.currentTime =
            Number(animation.effect!.getComputedTiming().duration) * 0.15;
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          return element.getBoundingClientRect().top;
        });
        expect(returningTop).toBeGreaterThan(before!.y + 4);
        expect(returningTop).toBeLessThan(siblingBefore!.y - 4);
        // Pick up again while the previous return is visibly incomplete. The
        // replacement animation must begin at that visible position, without
        // counting its existing movement twice or overshooting the destination.
        await startDrag(page, "Compact source");
        await expect
          .poll(async () => (await sibling.boundingBox())!.y)
          .toBeCloseTo(returningTop, 0);
        const restartingTop = await sibling.evaluate(async (element) => {
          const animation = element
            .getAnimations()
            .find((candidate) => candidate.playState === "paused")!;
          animation.currentTime =
            Number(animation.effect!.getComputedTiming().duration) * 0.5;
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          const top = element.getBoundingClientRect().top;
          animation.finish();
          return top;
        });
        expect(restartingTop).toBeGreaterThanOrEqual(before!.y - 1);
        expect(restartingTop).toBeLessThan(returningTop - 1);
        await expect
          .poll(async () => (await sibling.boundingBox())!.y)
          .toBeCloseTo(before!.y, 0);
        await page.keyboard.press("Escape");
        await page.mouse.up();
        await expect(page.locator("[data-dnd-dragging]")).toHaveCount(0);
        await expect(handle(page, "Compact source")).toBeFocused();
      }
      await sibling.evaluate((element) => {
        for (const animation of element.getAnimations()) animation.finish();
      });
      await expect
        .poll(async () => (await sibling.boundingBox())!.y)
        .toBeCloseTo(siblingBefore!.y, 0);
      await expect
        .poll(() =>
          cards.evaluateAll((elements) =>
            elements.map((element) =>
              element.getAttribute("data-board-card-id"),
            ),
          ),
        )
        .toEqual(order);
      expect(await saved(pool, sourceId)).toEqual(original);
    } finally {
      await cleanup(pool, data, owner.id);
    }
  });
}

test("pointer moves persist and cancellation never changes findings", async ({
  page,
  context,
}) => {
  const owner = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const data = await fixture(page, pool);
  try {
    const id = await finding(pool, data.service, "Pointer finding");
    await finding(pool, data.archived, "Archived finding");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${data.path}?archive=all`);
    await expect(handle(page, "Pointer finding")).toBeVisible();
    await expect(handle(page, "Archived finding")).toBeDisabled();
    const original = await saved(pool, id);
    let mutations = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"])
        mutations++;
    });
    await startDrag(page, "Pointer finding");
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(await saved(pool, id)).toEqual(original);
    await expect(handle(page, "Pointer finding")).toBeFocused();
    await startDrag(page, "Pointer finding");
    await drop(page, "new");
    expect(await saved(pool, id)).toEqual(original);
    await startDrag(page, "Pointer finding");
    await page.mouse.move(5, 5, { steps: 12 });
    await page.mouse.up();
    expect(await saved(pool, id)).toEqual(original);
    expect(mutations).toBe(0);
    await startDrag(page, "Pointer finding");
    await drop(page, "triaged");
    const result = page.getByText("Pointer finding moved to Triaged.", {
      exact: true,
    });
    await expect(result).toBeVisible();
    await expect(result).toBeFocused();
    await expect(
      page
        .getByRole("region", { name: "Triaged findings", exact: true })
        .getByRole("link", { name: "Pointer finding", exact: true }),
    ).toBeVisible();
    expect(await saved(pool, id)).toMatchObject({
      status: "triaged",
      version: original.version + 1,
      description: "Original evidence",
      remediation_notes: "Original remediation",
    });
    await page.reload();
    await expect(
      page
        .getByRole("region", { name: "Triaged findings", exact: true })
        .getByRole("link", { name: "Pointer finding", exact: true }),
    ).toBeVisible();
  } finally {
    await cleanup(pool, data, owner.id);
  }
});

test("stale drag reports a conflict and pending mutations block repeated changes", async ({
  page,
  context,
}) => {
  const owner = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const data = await fixture(page, pool);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const stale = await finding(pool, data.service, "Stale drag");
    const pending = await finding(pool, data.service, "Pending drag");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(data.path);
    await expect(handle(page, "Stale drag")).toBeVisible();
    await pool.query(
      "UPDATE finding SET status = 'resolved',version = version + 1 WHERE id = $1",
      [stale],
    );
    await startDrag(page, "Stale drag");
    await drop(page, "triaged");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Stale drag:",
    );
    await expect(page.getByRole("main").getByRole("alert")).toBeFocused();
    await expect(
      page
        .getByRole("region", { name: "Resolved findings", exact: true })
        .getByRole("link", { name: "Stale drag", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toBeFocused();
    expect((await saved(pool, stale)).status).toBe("resolved");
    await page
      .getByRole("button", { name: "Refresh board", exact: true })
      .click();
    await expect(handle(page, "Pending drag")).toBeEnabled();
    const originalColumn = page.getByRole("region", {
      name: "New findings",
      exact: true,
    });
    const originalOrder = await originalColumn
      .locator("[data-board-card-id]")
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-board-card-id")),
      );
    let actionCount = 0;
    await page.route(`**${data.path}`, async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().headers()["next-action"]
      ) {
        actionCount++;
        await gate;
      }
      await route.continue();
    });
    await startDrag(page, "Pending drag");
    await drop(page, "triaged");
    await expect.poll(() => actionCount).toBe(1);
    await expect(
      page.getByText("Updating Pending drag to Triaged…", { exact: true }),
    ).toBeVisible();
    await expect(handle(page, "Pending drag")).toBeDisabled();
    // Removing the lift does not predict the server response. The original
    // stays in its authoritative column until the response refreshes the board.
    await expect(page.locator("[data-dnd-dragging]")).toHaveCount(0);
    await expect(
      originalColumn.locator(`[data-board-card-id="${pending}"]`),
    ).toHaveCount(1);
    expect(
      await originalColumn
        .locator("[data-board-card-id]")
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("data-board-card-id")),
        ),
    ).toEqual(originalOrder);
    expect((await saved(pool, pending)).status).toBe("new");
    await expect(
      page.getByRole("button", {
        name: "Change status for Stale drag",
        exact: true,
      }),
    ).toBeDisabled();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    expect(actionCount).toBe(1);
    release();
    await expect(
      page.getByText("Pending drag moved to Triaged.", { exact: true }),
    ).toBeFocused();
    await expect(
      page
        .getByRole("region", { name: "Triaged findings", exact: true })
        .locator(`[data-board-card-id="${pending}"]`),
    ).toBeVisible();
    expect((await saved(pool, pending)).version).toBe(2);
  } finally {
    release();
    await cleanup(pool, data, owner.id);
  }
});

test("filtered drag can remove a card and retains persistent result focus", async ({
  page,
  context,
}) => {
  const owner = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const data = await fixture(page, pool);
  try {
    const id = await finding(pool, data.service, "Filtered drag");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${data.path}?status=new`);
    await expect(handle(page, "Filtered drag")).toBeVisible();
    await startDrag(page, "Filtered drag");
    await drop(page, "resolved");
    await expect(
      page.getByText("Filtered drag moved to Resolved.", { exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole("link", { name: "Filtered drag", exact: true }),
    ).toHaveCount(0);
    expect((await saved(pool, id)).status).toBe("resolved");
  } finally {
    await cleanup(pool, data, owner.id);
  }
});

test("severity badges remain distinct and readable in both themes", async ({
  page,
  context,
}) => {
  const owner = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const data = await fixture(page, pool);
  try {
    const severities = ["critical", "high", "medium", "low", "informational"];
    for (const severity of severities)
      await finding(pool, data.service, `${severity} severity`, severity);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(data.path);
    for (const theme of ["Light", "Dark"] as const) {
      await chooseTheme(page, theme);
      const visibleColumn = page.getByRole("region", {
        name: "New findings",
        exact: true,
      });
      await expect(
        visibleColumn.locator('[data-severity="informational"]'),
      ).toBeVisible();
      const colors: string[] = [];
      for (const severity of severities) {
        const badge = visibleColumn.locator(`[data-severity="${severity}"]`);
        await expect(badge).toHaveText(new RegExp(severity, "iu"));
        const style = await badge.evaluate((element) => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext("2d")!;
          const rgba = (color: string) => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            return [...ctx.getImageData(0, 0, 1, 1).data];
          };
          const over = (top: number[], bottom: number[]) =>
            top.map((value, index) =>
              index === 3
                ? 255
                : (value * top[3]) / 255 + bottom[index] * (1 - top[3] / 255),
            );
          const ancestors: Element[] = [];
          for (
            let current: Element | null = element;
            current;
            current = current.parentElement
          )
            ancestors.unshift(current);
          let background = [255, 255, 255, 255];
          for (const ancestor of ancestors)
            background = over(
              rgba(getComputedStyle(ancestor).backgroundColor),
              background,
            );
          const foreground = over(
            rgba(getComputedStyle(element).color),
            background,
          );
          const luminance = (rgb: number[]) =>
            rgb
              .slice(0, 3)
              .map((value) => value / 255)
              .map((value) =>
                value <= 0.04045
                  ? value / 12.92
                  : ((value + 0.055) / 1.055) ** 2.4,
              )
              .reduce(
                (sum, value, index) =>
                  sum + value * [0.2126, 0.7152, 0.0722][index],
                0,
              );
          const a = luminance(foreground),
            b = luminance(background);
          return {
            color: foreground.slice(0, 3).join(","),
            contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          };
        });
        expect(
          style.contrast,
          `${theme} ${severity} text contrast`,
        ).toBeGreaterThanOrEqual(4.5);
        colors.push(style.color);
      }
      expect(new Set(colors).size).toBe(5);
      await page.screenshot({
        path: test
          .info()
          .outputPath(`severity-board-${theme.toLowerCase()}.png`),
        fullPage: true,
      });
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        audit.violations.map(({ id, nodes }) => ({
          id,
          targets: nodes.map((node) => node.target),
        })),
      ).toEqual([]);
    }
  } finally {
    await cleanup(pool, data, owner.id);
  }
});

test("keyboard dragging moves between columns and cancels at responsive changes", async ({
  page,
  context,
}) => {
  const owner = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const data = await fixture(page, pool);
  try {
    const id = await finding(pool, data.service, "Keyboard finding");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(data.path);
    const control = handle(page, "Keyboard finding");
    await expect(control).toBeEnabled();
    await control.focus();
    await control.press("Space");
    await expect(
      page.locator('[data-dragging="true"]:not([inert]):not([inert] *)'),
    ).toHaveCount(1);
    await page.keyboard.press("ArrowRight");
    await expect(target(page, "triaged")).toHaveAttribute(
      "data-drop-active",
      "true",
    );
    await page.keyboard.press("Space");
    await expect(
      page.getByText("Keyboard finding moved to Triaged.", { exact: true }),
    ).toBeFocused();
    expect((await saved(pool, id)).status).toBe("triaged");
    let canceledMutationCount = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"])
        canceledMutationCount++;
    });
    // Both a normal window resize and crossing the mobile breakpoint must cancel
    // after selecting a different destination, without persisting that destination.
    for (const width of [1500, 1279]) {
      await expect(control).toBeEnabled();
      await control.focus();
      await control.press("Space");
      await expect(
        page.locator('[data-dragging="true"]:not([inert]):not([inert] *)'),
      ).toHaveCount(1);
      await page.keyboard.press("ArrowRight");
      await expect(target(page, "in_progress")).toHaveAttribute(
        "data-drop-active",
        "true",
      );
      await page.setViewportSize({ width, height: 1000 });
      await expect(
        page.locator('[data-dragging="true"]:not([inert]):not([inert] *)'),
      ).toHaveCount(0);
      await expect(
        page.getByRole("group", {
          name: "Drop finding into status",
          exact: true,
        }),
      ).toHaveCount(0);
      expect(await saved(pool, id)).toMatchObject({
        status: "triaged",
        version: 2,
      });
      expect(canceledMutationCount).toBe(0);
      if (width < 1280) {
        const selectedTab = page.getByRole("tab", { name: /^New \(/u });
        await expect(selectedTab).toHaveAttribute("aria-selected", "true");
        await expect(selectedTab).toBeFocused();
        await expect(selectedTab).toBeVisible();
      } else {
        await expect(control).toBeFocused();
      }
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
    await expect(control).toBeEnabled();
  } finally {
    await cleanup(pool, data, owner.id);
  }
});

test("touch scrolling outside a handle works and touch dragging reaches mobile status targets", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: origin,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  const owner = await verifiedAccount(context);
  const page = await context.newPage();
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const data = await fixture(page, pool);
  const session = await context.newCDPSession(page);
  try {
    for (let index = 0; index < 12; index++)
      await finding(pool, data.service, `Touch finding ${index}`);
    await page.goto(`${data.path}`);
    await expect(handle(page, "Touch finding 11")).toBeVisible();
    const cards = page.getByRole("group", {
      name: "New findings cards",
      exact: true,
    });
    const bounds = (await cards.boundingBox())!;
    // A real touch gesture on card content must preserve the column's native scrolling.
    const x = bounds.x + 30;
    const startY = bounds.y + Math.min(bounds.height - 30, 220);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: startY }],
    });
    for (let step = 1; step <= 8; step++) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: startY - step * 15 }],
      });
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() => cards.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await expect(
      page.getByRole("group", {
        name: "Drop finding into status",
        exact: true,
      }),
    ).toHaveCount(0);
    const touchHandle = handle(page, "Touch finding 11");
    let previousPosition = "";
    let stableSamples = 0;
    // Native touch scrolling can retain momentum after touchEnd. Wait for an
    // unobstructed, stationary handle instead of assuming scrollTop = 0 sticks.
    await expect
      .poll(async () => {
        await touchHandle.scrollIntoViewIfNeeded();
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => resolve()),
            ),
        );
        const point = await center(touchHandle);
        const sample = await page.evaluate(({ x, y }) => {
          const button = document.elementFromPoint(x, y)?.closest("button");
          return {
            hit: button?.getAttribute("aria-label") === "Move Touch finding 11",
            position: `${x.toFixed(1)}:${y.toFixed(1)}`,
          };
        }, point);
        stableSamples =
          sample.hit && sample.position === previousPosition
            ? stableSamples + 1
            : 0;
        previousPosition = sample.position;
        return stableSamples;
      })
      .toBeGreaterThanOrEqual(3);
    const start = await center(touchHandle);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [start],
    });
    // Exercise the configured 250ms touch activation delay before moving the handle.
    await page.waitForTimeout(300);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: start.x + 12, y: start.y + 12 }],
    });
    await expect(target(page, "resolved", true)).toBeVisible();
    const end = await center(target(page, "resolved", true));
    for (let step = 1; step <= 12; step++) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: start.x + ((end.x - start.x) * step) / 12,
            y: start.y + ((end.y - start.y) * step) / 12,
          },
        ],
      });
    }
    await expect(target(page, "resolved", true)).toHaveAttribute(
      "data-drop-active",
      "true",
    );
    // A full-page screenshot can resize the viewport and correctly cancel a
    // live drag, so capture the current mobile viewport without changing it.
    await page.screenshot({
      path: test.info().outputPath("mobile-active-drag-targets.png"),
      fullPage: false,
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(
      page.getByText("Touch finding 11 moved to Resolved.", { exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole("group", {
        name: "Drop finding into status",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await session.detach();
    await cleanup(pool, data, owner.id);
    await context.close();
  }
});

test("failed drag requests recover and revoked service access evicts stale cards", async ({
  page,
  context,
}) => {
  const owner = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const data = await fixture(page, pool);
  try {
    const failed = await finding(pool, data.service, "Failed request finding");
    const privateId = await finding(pool, data.service, "Private finding");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(data.path);
    await expect(handle(page, "Failed request finding")).toBeEnabled();
    let aborted = false;
    await page.route(`**${data.path}`, async (route) => {
      if (
        !aborted &&
        route.request().method() === "POST" &&
        route.request().headers()["next-action"]
      ) {
        aborted = true;
        await route.abort("failed");
      } else {
        await route.continue();
      }
    });
    await startDrag(page, "Failed request finding");
    await drop(page, "triaged");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Failed request finding:",
    );
    await expect(page.getByRole("main").getByRole("alert")).toBeFocused();
    // The action failed before reaching the server. Its automatic refresh must
    // preserve feedback and release the shared mutation gate for another attempt.
    await expect(handle(page, "Failed request finding")).toBeEnabled();
    await expect(page.getByRole("main").getByRole("alert")).toBeFocused();
    expect(aborted).toBe(true);
    expect(await saved(pool, failed)).toMatchObject({
      status: "new",
      version: 1,
    });

    // Restrict this isolated service to an empty group, then remove the fixture
    // user's owner override. The already rendered cards are now stale private UI.
    const group = randomUUID();
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query(
        "INSERT INTO workspace_group (id,workspace_id,name) VALUES ($1,$2,'Restricted drag group')",
        [group, data.workspace],
      );
      await connection.query(
        "INSERT INTO service_access_group (workspace_id,service_id,group_id) VALUES ($1,$2,$3)",
        [data.workspace, data.service, group],
      );
      await connection.query(
        "UPDATE member SET role = 'member' WHERE organization_id = $1 AND user_id = $2",
        [data.workspace, owner.id],
      );
      await connection.query("COMMIT");
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
    await startDrag(page, "Private finding");
    await drop(page, "resolved");
    await expect(
      page.getByRole("link", { name: "Private finding", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Failed request finding", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Move /u })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Change status for /u }),
    ).toHaveCount(0);
    expect(await saved(pool, privateId)).toMatchObject({
      status: "new",
      version: 1,
    });
    expect(await saved(pool, failed)).toMatchObject({
      status: "new",
      version: 1,
    });
  } finally {
    await cleanup(pool, data, owner.id);
  }
});
