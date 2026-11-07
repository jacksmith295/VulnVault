import { randomUUID } from "node:crypto";
import { expect, type Locator } from "@playwright/test";
import { Pool } from "pg";
import { test } from "./fixtures";
import { verifiedAccount } from "./helpers";

async function expectFieldError(control: Locator, error: string) {
  await expect(control).toHaveAttribute("aria-invalid", "true");
  await expect(control).toHaveAccessibleDescription(new RegExp(error, "u"));
  const descriptionIds = (await control.getAttribute(
    "aria-describedby",
  ))!.split(/\s+/u);
  expect(descriptionIds.some((id) => id.endsWith("-error"))).toBe(true);
}

test("domain forms associate validation errors, focus the first invalid field and recover", async ({
  page,
  context,
}) => {
  const person = await verifiedAccount(context);
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const workspaceId = randomUUID();
  const slug = `validation-${randomUUID()}`;
  await pool.query(
    "INSERT INTO organization (id,name,slug,created_at) VALUES ($1,$2,$3,now())",
    [workspaceId, "Validation workspace", slug],
  );
  await pool.query(
    "INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,'owner',now())",
    [randomUUID(), workspaceId, person.id],
  );
  try {
    await page.goto(`/w/${slug}/services/new`);
    const name = page.getByLabel("Name", { exact: true });
    const repositories = page.getByLabel("Repository URLs", { exact: true });
    const saveService = page.getByRole("button", {
      name: "Create service",
      exact: true,
    });
    await expect(name).toHaveAttribute("required", "");
    await name.fill("  ");
    await repositories.fill("not a URL");
    await saveService.click();
    await expect(name).toBeFocused();
    await expectFieldError(name, "Use at least 2 characters for the name");
    await expectFieldError(repositories, "Use HTTP or HTTPS repository URLs");
    await expect(repositories).toHaveAccessibleDescription(
      /Optional.*Use HTTP or HTTPS repository URLs/u,
    );
    await name.fill("Validation service");
    for (const [value, error] of [
      ["not a URL", "Use HTTP or HTTPS repository URLs"],
      [
        "https://example.com/repo\nhttps://example.com/repo/",
        "Remove duplicate repository URLs",
      ],
      [
        Array.from(
          { length: 21 },
          (_, i) => `https://example.com/repo-${i}`,
        ).join("\n"),
        "Use no more than 20 repository URLs",
      ],
    ]) {
      await repositories.fill(value);
      await saveService.click();
      await expect(repositories).toBeFocused();
      await expectFieldError(repositories, error);
      await expect(name).not.toHaveAttribute("aria-invalid", "true");
    }
    await repositories.fill("https://example.com/repo");
    await saveService.click();
    await expect(
      page.getByRole("heading", { name: "Validation service", exact: true }),
    ).toBeVisible();
    const servicePath = new URL(page.url()).pathname;
    await page.goto(`${servicePath}/findings/new`);
    const title = page.getByLabel("Title", { exact: true });
    const description = page.getByLabel("Description", { exact: true });
    const severity = page.getByRole("combobox", {
      name: "Severity",
      exact: true,
    });
    const references = page.getByLabel("Reference URLs", { exact: true });
    const saveFinding = page.getByRole("button", {
      name: "Create finding",
      exact: true,
    });
    await expect(severity).toHaveAttribute("aria-required", "true");
    await title.fill("  ");
    await description.fill("  ");
    await references.fill("not a URL");
    // Native required validation normally stops submit for an empty select.
    // Bypass it only here to inspect the schema error on the rendered trigger.
    await page.locator("main form").evaluate((form: HTMLFormElement) => {
      form.noValidate = true;
    });
    await saveFinding.click();
    await expect(title).toBeFocused();
    await expectFieldError(title, "Use at least 2 characters for the title");
    await expectFieldError(description, "Enter a description");
    await expectFieldError(severity, "Select a severity");
    await expectFieldError(references, "Use HTTP or HTTPS reference URLs");
    await title.fill("Validation finding");
    await description.fill("A finding with corrected fields.");
    await references.fill("https://example.com/advisory");
    await saveFinding.click();
    await expect(severity).toBeFocused();
    await expectFieldError(severity, "Select a severity");
    await expect(title).not.toHaveAttribute("aria-invalid", "true");
    await severity.click();
    await page.getByRole("option", { name: "High", exact: true }).click();
    await page.locator("main form").evaluate((form: HTMLFormElement) => {
      form.noValidate = false;
    });
    for (const [value, error] of [
      ["not a URL", "Use HTTP or HTTPS reference URLs"],
      [
        "https://example.com/advisory\nhttps://example.com/advisory",
        "Remove duplicate reference URLs",
      ],
      [
        Array.from(
          { length: 21 },
          (_, i) => `https://example.com/advisory-${i}`,
        ).join("\n"),
        "Use no more than 20 reference URLs",
      ],
    ]) {
      await references.fill(value);
      await saveFinding.click();
      await expect(references).toBeFocused();
      await expectFieldError(references, error);
      await expect(severity).not.toHaveAttribute("aria-invalid", "true");
    }
    await references.fill("https://example.com/advisory");
    await saveFinding.click();
    await expect(
      page.getByRole("heading", { name: "Validation finding", exact: true }),
    ).toBeVisible();
  } finally {
    await pool.query(
      "DELETE FROM finding WHERE service_id IN (SELECT id FROM service WHERE workspace_id = $1)",
      [workspaceId],
    );
    await pool.query("DELETE FROM service WHERE workspace_id = $1", [
      workspaceId,
    ]);
    await pool.query("DELETE FROM organization WHERE id = $1", [workspaceId]);
    await pool.query('DELETE FROM "user" WHERE id = $1', [person.id]);
    await pool.end();
  }
});
