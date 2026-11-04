import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

const inbox = "http://127.0.0.1:8025";

export async function emailLink(request: APIRequestContext, recipient: string, subject: string) {
  let messageId = "";
  await expect.poll(async () => {
    const response = await request.get(`${inbox}/api/v1/search`, {
      params: { query: `to:${recipient}` },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    const message = data.messages.find((entry: { ID: string; Subject: string }) =>
      entry.Subject.toLowerCase().includes(subject));
    messageId = message?.ID ?? "";
    return !!messageId;
  }, { timeout: 15_000 }).toBe(true);

  const response = await request.get(`${inbox}/api/v1/message/${messageId}`);
  expect(response.ok()).toBeTruthy();
  const message = await response.json();
  const link = message.Text.match(/https?:\/\/[^\s<>]+/u)?.[0];
  if (!link) throw new Error("Expected an authentication link in the development email.");
  expect(new URL(link).origin).toBe("http://127.0.0.1:3100");
  return link as string;
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
}

export async function chooseTheme(page: Page, theme: "Light" | "Dark" | "System") {
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("menuitemradio", { name: theme, exact: true }).click();
  await expect(page.getByRole("menu")).not.toBeVisible();
  if (theme !== "System") await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme.toLowerCase()}\\b`, "u"));
}

export const origin = "http://127.0.0.1:3100";

export function clientHeaders() {
  return { "x-forwarded-for": `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` };
}

export async function verifiedAccount(context: BrowserContext) {
  const email = `workspace-${randomUUID()}@example.com`;
  const password = "WorkspaceTestPassword-123!";
  await context.setExtraHTTPHeaders({
    ...clientHeaders(),
    origin,
  });
  const response = await context.request.post(`${origin}/api/auth/sign-up/email`, {
    data: { name: "Workspace Developer", email, password, callbackURL: "/login?verified=true" },
  });
  expect(response.ok()).toBeTruthy();
  const { user } = await response.json();
  await context.request.get(await emailLink(context.request, email, "verify"));
  const login = await context.request.post(`${origin}/api/auth/sign-in/email`, { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  return { id: user.id as string, email, password };
}
