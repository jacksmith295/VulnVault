import { test } from "./fixtures";
import { expect } from "@playwright/test";
import { chooseTheme } from "./helpers";

test("themes follow system preference and persist explicit choices without hydration errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydration|did not match|server rendered/iu.test(message.text())) errors.push(message.text());
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/u);
  await chooseTheme(page, "Light");
  expect(await page.evaluate(() => localStorage.getItem("vv-theme"))).toBe("light");
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/\blight\b/u);
  await chooseTheme(page, "System");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/u);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveClass(/\blight\b/u);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/\bdark\b/u);
  expect(await page.locator("html").evaluate((root) => getComputedStyle(root).getPropertyValue("--font-inter").trim())).not.toBe("");
  expect(await page.locator("body").evaluate((body) => getComputedStyle(body).fontFamily)).toMatch(/inter/iu);
  expect(errors).toEqual([]);
});

test("primary controls stay readable in both themes and the public shell fits mobile", async ({ page }) => {
  await page.goto("/login");
  for (const theme of ["Light", "Dark"] as const) {
    await chooseTheme(page, theme);
    const contrast = await page.getByRole("button", { name: "Login", exact: true }).evaluate((button) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable for colour conversion.");
      function luminance(colour: string) {
        context!.clearRect(0, 0, 1, 1);
        context!.fillStyle = colour;
        context!.fillRect(0, 0, 1, 1);
        const values = [...context!.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
      }
      const style = getComputedStyle(button);
      const foreground = luminance(style.color);
      const background = luminance(style.backgroundColor);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: test.info().outputPath(`login-${theme.toLowerCase()}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole("button", { name: "Login", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: "System", exact: true })).toBeVisible();
  const popup = await page.getByRole("menu").boundingBox();
  expect(popup).not.toBeNull();
  expect(popup!.x).toBeGreaterThanOrEqual(0);
  expect(popup!.x + popup!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Theme", exact: true })).toBeFocused();
  await page.screenshot({ path: test.info().outputPath("login-mobile.png"), fullPage: true });
});
