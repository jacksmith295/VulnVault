import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { test } from "./fixtures";
import { origin } from "./helpers";

test("forged forwarding headers cannot reset local authentication limits", async ({
  request,
}) => {
  const email = `absent-${randomUUID()}@example.com`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await request.post("/api/auth/sign-in/email", {
      headers: {
        origin,
        "X-Forwarded-For":
          attempt % 2
            ? `198.51.100.${attempt + 1}, 127.0.0.1`
            : `198.51.100.${attempt + 1}`,
        "X-Real-IP": `203.0.113.${attempt + 1}`,
        forwarded: `for=198.51.100.${attempt + 1}`,
      },
      data: { email, password: "Wrong-password-123!" },
    });
    expect(response.status()).toBe(attempt < 5 ? 401 : 429);
    if (attempt === 5) expect(response.headers()["x-retry-after"]).toBeTruthy();
  }
  const noForwardingHeaders = await request.post("/api/auth/sign-in/email", {
    headers: { origin },
    data: { email, password: "Wrong-password-123!" },
  });
  expect(noForwardingHeaders.status()).toBe(429);
});
