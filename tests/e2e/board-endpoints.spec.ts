import { randomUUID } from "node:crypto";
import { expect, request as apiRequest, type Page } from "@playwright/test";
import { Pool } from "pg";
import { test } from "./fixtures";
import { origin, verifiedAccount } from "./helpers";

async function workspaceFixture(page: Page, pool: Pool) {
  const slug = `board-http-${randomUUID()}`;
  await page.goto("/workspaces/new");
  await page
    .getByLabel("Workspace name", { exact: true })
    .fill("Board HTTP workspace");
  await page.getByLabel("URL slug", { exact: true }).fill(slug);
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(page).toHaveURL(`${origin}/w/${slug}`);
  const { rows } = await pool.query(
    "SELECT id FROM organization WHERE slug = $1",
    [slug],
  );
  return { slug, id: rows[0].id as string };
}

async function cleanup(
  pool: Pool,
  workspaceId: string | undefined,
  users: string[],
) {
  try {
    if (workspaceId) {
      await pool.query(
        "DELETE FROM finding WHERE service_id IN (SELECT id FROM service WHERE workspace_id = $1)",
        [workspaceId],
      );
      await pool.query("DELETE FROM service WHERE workspace_id = $1", [
        workspaceId,
      ]);
      await pool.query("DELETE FROM organization WHERE id = $1", [workspaceId]);
    }
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [users]);
  } finally {
    await pool.end();
  }
}

test("board paging HTTP endpoint preserves scope validation and authentication", async ({
  page,
  context,
  browser,
}) => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const users: string[] = [];
  const strangerContext = await browser.newContext();
  const signedOut = await apiRequest.newContext();
  let workspaceId: string | undefined;
  try {
    const owner = await verifiedAccount(context);
    users.push(owner.id);
    const workspace = await workspaceFixture(page, pool);
    workspaceId = workspace.id;
    const serviceId = randomUUID();
    await pool.query(
      "INSERT INTO service (id,workspace_id,name) VALUES ($1,$2,'Endpoint service')",
      [serviceId, workspace.id],
    );
    for (let index = 0; index < 21; index++) {
      await pool.query(
        "INSERT INTO finding (id,service_id,title,description,severity,status) VALUES ($1,$2,$3,'Endpoint test','high','new')",
        [randomUUID(), serviceId, `Endpoint finding ${index}`],
      );
    }
    await page.goto(`/w/${workspace.slug}`);
    const pagingResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname ===
          `/w/${workspace.slug}/findings/more`,
    );
    await page
      .getByRole("button", { name: "Load more New findings", exact: true })
      .click();
    const response = await pagingResponse;
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    const result = await response.json();
    expect(result.reset).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].serviceId).toBe(serviceId);
    const url = new URL(response.url());
    expect(url.searchParams.get("cursor")).toBeTruthy();
    expect(url.searchParams.get("scope")).toBeTruthy();

    for (const key of ["column", "cursor", "scope", "archive"]) {
      const duplicate = new URL(url);
      duplicate.searchParams.append(key, duplicate.searchParams.get(key)!);
      const rejected = await context.request.get(duplicate.toString());
      expect(rejected.status()).toBe(200);
      expect(await rejected.json()).toEqual({ reset: true });
    }
    const unknownFilter = new URL(url);
    unknownFilter.searchParams.set("unexpected", "value");
    expect(
      await (await context.request.get(unknownFilter.toString())).json(),
    ).toEqual({ reset: true });

    const stranger = await verifiedAccount(strangerContext);
    users.push(stranger.id);
    const denied = await strangerContext.request.get(url.toString());
    expect(denied.status()).toBe(200);
    expect(await denied.json()).toEqual({ reset: true });
    const unauthenticated = await signedOut.get(url.toString(), {
      maxRedirects: 0,
    });
    expect(unauthenticated.status()).toBe(307);
    expect(new URL(unauthenticated.headers().location, origin).pathname).toBe(
      "/login",
    );
  } finally {
    await signedOut.dispose();
    await strangerContext.close();
    await cleanup(pool, workspaceId, users);
  }
});

test("workspace preference HTTP endpoint checks origin and membership before setting cookies", async ({
  page,
  context,
  browser,
}) => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const users: string[] = [];
  const strangerContext = await browser.newContext();
  const signedOut = await apiRequest.newContext();
  let ownerWithoutOrigin:
    Awaited<ReturnType<typeof apiRequest.newContext>> | undefined;
  let workspaceId: string | undefined;
  try {
    const owner = await verifiedAccount(context);
    users.push(owner.id);
    const workspace = await workspaceFixture(page, pool);
    workspaceId = workspace.id;
    const url = `${origin}/w/${workspace.slug}/preference`;
    const saved = await context.request.post(url, { headers: { origin } });
    expect(saved.status()).toBe(204);
    expect(saved.headers()["cache-control"]).toBe("private, no-store");
    expect(saved.headers()["set-cookie"]).toContain("vv-workspace=");
    expect(saved.headers()["set-cookie"]).toContain(workspace.id);
    expect(saved.headers()["set-cookie"]).toContain("HttpOnly");

    const evilOrigin = await context.request.post(url, {
      headers: { origin: "https://attacker.example" },
    });
    expect(evilOrigin.status()).toBe(403);
    expect(evilOrigin.headers()["set-cookie"]).toBeUndefined();
    ownerWithoutOrigin = await apiRequest.newContext({
      storageState: await context.storageState(),
    });
    const missingOrigin = await ownerWithoutOrigin.post(url);
    expect(missingOrigin.status()).toBe(403);
    expect(missingOrigin.headers()["set-cookie"]).toBeUndefined();

    const stranger = await verifiedAccount(strangerContext);
    users.push(stranger.id);
    const denied = await strangerContext.request.post(url, {
      headers: { origin },
      maxRedirects: 0,
    });
    expect(denied.status()).toBe(404);
    expect(denied.headers()["set-cookie"]).toBeUndefined();
    const unauthenticated = await signedOut.post(url, {
      headers: { origin },
      maxRedirects: 0,
    });
    expect(unauthenticated.status()).toBe(307);
    expect(new URL(unauthenticated.headers().location, origin).pathname).toBe(
      "/login",
    );
    expect(unauthenticated.headers()["set-cookie"]).toBeUndefined();
  } finally {
    await ownerWithoutOrigin?.dispose();
    await signedOut.dispose();
    await strangerContext.close();
    await cleanup(pool, workspaceId, users);
  }
});
