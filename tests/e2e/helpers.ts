import { expect, type APIRequestContext, type Page } from "@playwright/test";

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
