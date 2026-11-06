import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createGithubClient,
  parseGithubRepositoryUrl,
} from "../../src/features/integrations/github";
import { GithubError } from "../../src/features/integrations/types";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const config = {
  appId: "123",
  privateKey: keys.privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString(),
};
const clock = Date.parse("2026-11-06T12:00:00Z");
const repo = {
  id: "456",
  fullName: "owner/repo",
  url: "https://github.com/owner/repo",
};
const metadata = { id: 456, full_name: "owner/repo", html_url: repo.url };
const token = { token: "secret-token", expires_at: "2026-11-06T13:00:00Z" };
const installation = {
  id: 789,
  app_id: 123,
  account: { id: 99, login: "owner", type: "User" },
  suspended_at: null,
  permissions: { metadata: "read", vulnerability_alerts: "read" },
};
const alert = {
  number: 1,
  state: "open",
  html_url: `${repo.url}/security/dependabot/1`,
  dependency: {
    package: { name: "example", ecosystem: "npm" },
    manifest_path: "package-lock.json",
  },
  security_advisory: {
    ghsa_id: "GHSA-abcd-1234-abcd",
    cve_id: null,
    summary: "Vulnerable dependency",
    description: "Details",
  },
  security_vulnerability: {
    severity: "high",
    vulnerable_version_range: "< 2",
    first_patched_version: null,
  },
  created_at: "2026-11-01T12:00:00Z",
  updated_at: "2026-11-01T12:00:00Z",
};
const json = (value: unknown, headers?: HeadersInit) =>
  new Response(JSON.stringify(value), { headers });
function client(responses: Response[]) {
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected request");
    return response;
  });
  return {
    transport,
    github: createGithubClient({ config, fetch: transport, now: () => clock }),
  };
}

describe("GitHub App provider", () => {
  it("signs an authentic short-lived App JWT and validates installation identity", async () => {
    const { github, transport } = client([json(installation)]);
    await expect(
      github.getInstallationForRepository("owner/repo"),
    ).resolves.toMatchObject({ id: "789", appId: "123", accountId: "99" });
    const init = transport.mock.calls[0][1]!;
    const jwt = new Headers(init.headers).get("Authorization")!.slice(7);
    const [header, payload, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "RS256",
      typ: "JWT",
    });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual({
      iat: clock / 1000 - 60,
      exp: clock / 1000 + 540,
      iss: "123",
    });
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${header}.${payload}`),
        keys.publicKey,
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
    expect(init.redirect).toBe("error");
  });

  it.each([
    { ...installation, app_id: 999 },
    { ...installation, suspended_at: "2026-11-01T12:00:00Z" },
    { ...installation, permissions: { metadata: "read" } },
    { ...installation, account: { ...installation.account, type: "Bot" } },
  ])("rejects an invalid installation grant", async (value) => {
    await expect(
      client([json(value)]).github.getInstallationForRepository("owner/repo"),
    ).rejects.toBeInstanceOf(GithubError);
  });

  it("uses a repository-scoped token, follows valid cursors and normalizes nullable fields", async () => {
    const next =
      "https://api.github.com/repos/owner/repo/dependabot/alerts?per_page=100&after=cursor";
    const fixed = {
      ...alert,
      number: 2,
      state: "fixed",
      html_url: `${repo.url}/security/dependabot/2`,
    };
    const { github, transport } = client([
      json(token),
      json(metadata),
      json([alert], { Link: `<${next}>; rel="next"` }),
      json([fixed]),
    ]);
    const result = await github.listAlerts("789", repo);
    expect(result.map((value) => value.state)).toEqual(["open", "fixed"]);
    expect(result[0]).toMatchObject({
      cveId: null,
      patchedVersion: null,
      packageName: "example",
    });
    expect(JSON.parse(transport.mock.calls[0][1]!.body as string)).toEqual({
      repository_ids: [456],
      permissions: { vulnerability_alerts: "read", metadata: "read" },
    });
    expect(transport.mock.calls[1][0]).toBe(
      "https://api.github.com/repositories/456",
    );
  });

  it("fails closed for repository identity replacement before requesting alerts", async () => {
    const { github, transport } = client([
      json(token),
      json({ ...metadata, id: 999 }),
    ]);
    await expect(github.listAlerts("789", repo)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it.each([403, 422])(
    "rejects public metadata without installation access when scoped mint returns %s",
    async (status) => {
      const { github, transport } = client([
        json(token),
        json(metadata),
        new Response("not granted", { status }),
      ]);
      await expect(
        github.getRepository("789", { fullName: "owner/repo" }),
      ).rejects.toMatchObject({ code: "unavailable" });
      expect(JSON.parse(transport.mock.calls[2][1]!.body as string)).toEqual({
        repository_ids: [456],
        permissions: { vulnerability_alerts: "read", metadata: "read" },
      });
    },
  );

  it("proves the canonical repository ID grant before returning public metadata", async () => {
    const { github, transport } = client([
      json(token),
      json(metadata),
      json(token),
    ]);
    await expect(
      github.getRepository("789", { fullName: "owner/repo" }),
    ).resolves.toEqual(repo);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(
      JSON.parse(transport.mock.calls[2][1]!.body as string).repository_ids,
    ).toEqual([456]);
  });

  it.each([
    "https://evil.example/repos/owner/repo/dependabot/alerts?after=x",
    "https://api.github.com/repos/other/repo/dependabot/alerts?after=x",
    "https://user:pass@api.github.com/repos/owner/repo/dependabot/alerts?after=x",
  ])(
    "rejects unsafe pagination without sending credentials: %s",
    async (next) => {
      const { github, transport } = client([
        json(token),
        json(metadata),
        json([alert], { Link: `<${next}>; rel="next"` }),
      ]);
      await expect(github.listAlerts("789", repo)).rejects.toMatchObject({
        code: "invalid_response",
      });
      expect(transport).toHaveBeenCalledTimes(3);
    },
  );

  it("rejects a later invalid page instead of returning a partial snapshot", async () => {
    const { github } = client([
      json(token),
      json(metadata),
      json([alert], {
        Link: '<https://api.github.com/repos/owner/repo/dependabot/alerts?after=x>; rel="next"',
      }),
      json([{ ...alert, number: 2, state: "unknown" }]),
    ]);
    await expect(github.listAlerts("789", repo)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("preserves provider backoff without exposing upstream response bodies", async () => {
    const { github } = client([
      new Response("sensitive upstream diagnostic", {
        status: 429,
        headers: { "retry-after": "120" },
      }),
    ]);
    await expect(
      github.getInstallationForRepository("owner/repo"),
    ).rejects.toMatchObject({
      code: "rate_limited",
      retryAt: new Date(clock + 120_000),
    });
  });

  it.each([403, 404, 302])(
    "does not interpret unavailable status %s as an empty snapshot",
    async (status) => {
      await expect(
        client([
          new Response("secret", { status }),
        ]).github.getInstallationForRepository("owner/repo"),
      ).rejects.toMatchObject({ code: "unavailable" });
    },
  );

  it("bounds streamed response size and malformed JSON", async () => {
    await expect(
      client([
        new Response("x".repeat(2_097_153)),
      ]).github.getInstallationForRepository("owner/repo"),
    ).rejects.toMatchObject({ code: "response_limit" });
    await expect(
      client([new Response("not json")]).github.getInstallationForRepository(
        "owner/repo",
      ),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("bounds the complete operation deadline", async () => {
    let time = clock;
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => {
      time += 61_000;
      return json(token);
    });
    const github = createGithubClient({
      config,
      fetch: transport,
      now: () => time,
    });
    await expect(github.listAlerts("789", repo)).rejects.toMatchObject({
      code: "response_limit",
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("bounds pagination even when every response is empty and valid", async () => {
    const pages = Array.from({ length: 20 }, (_, index) =>
      json([], {
        Link: `<https://api.github.com/repos/owner/repo/dependabot/alerts?after=${index}>; rel="next"`,
      }),
    );
    const { github, transport } = client([
      json(token),
      json(metadata),
      ...pages,
    ]);
    await expect(github.listAlerts("789", repo)).rejects.toMatchObject({
      code: "response_limit",
    });
    expect(transport).toHaveBeenCalledTimes(22);
  });

  it("cancels a stalled request when its timeout expires", async () => {
    vi.useFakeTimers();
    try {
      const transport = vi.fn<typeof fetch>().mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init!.signal!.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
      );
      const pending = createGithubClient({
        config,
        fetch: transport,
        now: () => clock,
      }).getInstallationForRepository("owner/repo");
      const assertion = expect(pending).rejects.toMatchObject({
        code: "network",
      });
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("supports an unconfigured server without making a request", async () => {
    await expect(
      createGithubClient({ config: null }).getInstallationForRepository(
        "owner/repo",
      ),
    ).rejects.toMatchObject({ code: "not_configured" });
  });

  it("accepts only direct HTTPS GitHub repository URLs", () => {
    expect(parseGithubRepositoryUrl("https://github.com/owner/repo.git")).toBe(
      "owner/repo",
    );
    for (const value of [
      "https://user:pass@github.com/owner/repo",
      "https://evil.example/owner/repo",
      "https://github.com/owner/repo?x=1",
      "http://github.com/owner/repo",
      "https://github.com/owner/repo/issues",
    ])
      expect(parseGithubRepositoryUrl(value)).toBeNull();
  });
});
