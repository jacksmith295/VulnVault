import "server-only";
import { sign } from "node:crypto";
import { z } from "zod";
import { readGithubConfig, type GithubConfig } from "./config";
import {
  GithubError,
  type DependabotAlert,
  type GithubInstallation,
  type GithubRepository,
} from "./types";

export { GithubError, githubErrorMessage } from "./types";
export { parseGithubRepositoryUrl } from "./repository-url";
export type {
  DependabotAlert,
  GithubInstallation,
  GithubRepository,
} from "./types";

const origin = "https://api.github.com";
const id = z.number().int().positive().safe().transform(String);
const text = z.string().max(8_192);
const name = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+$/)
  .max(100);
const fullName = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
  .max(201);
const date = z.iso.datetime({ offset: true });
const installationSchema = z.object({
  id,
  app_id: id,
  account: z.object({
    id,
    login: name,
    type: z.enum(["User", "Organization"]),
  }),
  suspended_at: z.null(),
  permissions: z.object({
    metadata: z.literal("read"),
    vulnerability_alerts: z.enum(["read", "write"]),
  }),
});
const repositorySchema = z.object({
  id,
  full_name: fullName,
  html_url: z.string().max(512),
});
const tokenSchema = z.object({
  token: z.string().min(1).max(8_192),
  expires_at: date,
});
const alertSchema = z.object({
  number: z.number().int().positive().safe(),
  state: z.enum(["open", "fixed", "dismissed", "auto_dismissed"]),
  dependency: z.object({
    package: z.object({ name: text, ecosystem: z.string().max(100) }),
    manifest_path: text,
  }),
  security_advisory: z.object({
    ghsa_id: z
      .string()
      .regex(/^GHSA-[a-z0-9-]+$/)
      .max(64),
    cve_id: z
      .string()
      .regex(/^CVE-\d{4}-\d+$/)
      .max(64)
      .nullable(),
    summary: text,
    description: z.string().max(262_144),
  }),
  security_vulnerability: z.object({
    severity: z.enum(["low", "medium", "high", "critical"]),
    vulnerable_version_range: text,
    first_patched_version: z.object({ identifier: text }).nullable(),
  }),
  created_at: date,
  updated_at: date,
  html_url: z.string().max(512),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new GithubError("invalid_response");
  return result.data;
}

function checkId(value: string): string {
  if (!/^[1-9]\d{0,15}$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new GithubError("configuration");
  return value;
}

function checkFullName(value: string): string {
  if (!fullName.safeParse(value).success)
    throw new GithubError("configuration");
  return value;
}

export function createGithubClient(
  deps: {
    config?: GithubConfig | null;
    fetch?: typeof fetch;
    now?: () => number;
  } = {},
) {
  const transport = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  // Configuration is loaded only when an operation starts, so unconfigured pages can still render.
  function config(): GithubConfig {
    const value = deps.config === undefined ? readGithubConfig() : deps.config;
    if (!value) throw new GithubError("not_configured");
    checkId(value.appId);
    return value;
  }

  function jwt(settings: GithubConfig): string {
    try {
      const encode = (value: unknown) =>
        Buffer.from(JSON.stringify(value)).toString("base64url");
      const time = Math.floor(now() / 1_000);
      const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat: time - 60, exp: time + 540, iss: settings.appId })}`;
      return `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), settings.privateKey).toString("base64url")}`;
    } catch {
      throw new GithubError("configuration");
    }
  }

  function operation() {
    const deadline = now() + 60_000;
    let requests = 0;
    let totalBytes = 0;
    return async function request(
      path: string,
      authorization: string,
      body?: object,
    ): Promise<{ value: unknown; link: string | null }> {
      const remaining = deadline - now();
      if (remaining <= 0 || ++requests > 22)
        throw new GithubError("response_limit");
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        Math.min(10_000, remaining),
      );
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const url = new URL(path, origin);
        if (url.origin !== origin || url.username || url.password || url.hash)
          throw new GithubError("invalid_response");
        const response = await transport(url.toString(), {
          method: body ? "POST" : "GET",
          redirect: "error",
          signal: controller.signal,
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${authorization}`,
            "X-GitHub-Api-Version": "2026-03-10",
            "User-Agent": "VulnVault",
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (
          response.status === 429 ||
          (response.status === 403 &&
            (response.headers.has("retry-after") ||
              response.headers.get("x-ratelimit-remaining") === "0"))
        ) {
          const retry = Number(response.headers.get("retry-after"));
          const reset =
            Number(response.headers.get("x-ratelimit-reset")) * 1_000;
          const retryTime =
            response.headers.has("retry-after") &&
            Number.isFinite(retry) &&
            retry >= 0
              ? now() + retry * 1_000
              : now() + 60_000;
          throw new GithubError(
            "rate_limited",
            new Date(
              Math.min(
                now() + 86_400_000,
                Math.max(
                  now() + 1_000,
                  retryTime,
                  Number.isFinite(reset) ? reset : 0,
                ),
              ),
            ),
          );
        }
        if (response.status >= 300 && response.status < 400)
          throw new GithubError("unavailable");
        if (Number(response.headers.get("content-length")) > 2_097_152)
          throw new GithubError("response_limit");
        reader = response.body?.getReader();
        if (!reader) throw new GithubError("invalid_response");
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          totalBytes += chunk.value.byteLength;
          if (bytes > 2_097_152 || totalBytes > 16_777_216 || now() > deadline)
            throw new GithubError("response_limit");
          chunks.push(chunk.value);
        }
        let value: unknown;
        try {
          value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          throw new GithubError(
            response.ok ? "invalid_response" : "unavailable",
          );
        }
        if (!response.ok) {
          if (
            response.status === 403 &&
            typeof value === "object" &&
            value !== null &&
            "message" in value &&
            typeof value.message === "string" &&
            /secondary rate limit|abuse detection/i.test(value.message)
          )
            throw new GithubError("rate_limited", new Date(now() + 60_000));
          throw new GithubError("unavailable");
        }
        return { value, link: response.headers.get("link") };
      } catch (error) {
        if (error instanceof GithubError) throw error;
        throw new GithubError("network");
      } finally {
        clearTimeout(timeout);
        if (reader) await reader.cancel().catch(() => undefined);
      }
    };
  }

  async function token(
    request: ReturnType<typeof operation>,
    installationId: string,
    repositoryId?: string,
  ) {
    const settings = config();
    const result = await request(
      `/app/installations/${checkId(installationId)}/access_tokens`,
      jwt(settings),
      {
        ...(repositoryId
          ? { repository_ids: [Number(checkId(repositoryId))] }
          : {}),
        permissions: { vulnerability_alerts: "read", metadata: "read" },
      },
    );
    const value = parse(tokenSchema, result.value);
    if (Date.parse(value.expires_at) <= now())
      throw new GithubError("invalid_response");
    return value.token;
  }

  async function repository(
    request: ReturnType<typeof operation>,
    accessToken: string,
    input: { id?: string; fullName?: string },
  ): Promise<GithubRepository> {
    const path = input.id
      ? `/repositories/${checkId(input.id)}`
      : `/repos/${checkFullName(input.fullName ?? "")}`;
    const result = parse(
      repositorySchema,
      (await request(path, accessToken)).value,
    );
    if (input.id && input.id !== result.id)
      throw new GithubError("unavailable");
    if (result.html_url !== `https://github.com/${result.full_name}`)
      throw new GithubError("invalid_response");
    return { id: result.id, fullName: result.full_name, url: result.html_url };
  }

  return {
    async getInstallationForRepository(
      value: string,
    ): Promise<GithubInstallation> {
      const settings = config();
      const result = parse(
        installationSchema,
        (
          await operation()(
            `/repos/${checkFullName(value)}/installation`,
            jwt(settings),
          )
        ).value,
      );
      if (result.app_id !== settings.appId)
        throw new GithubError("unavailable");
      return {
        id: result.id,
        appId: result.app_id,
        accountId: result.account.id,
        accountLogin: result.account.login,
        accountType: result.account.type,
      };
    },
    async getRepository(
      installationId: string,
      input: { id?: string; fullName?: string },
    ): Promise<GithubRepository> {
      const request = operation();
      const result = await repository(
        request,
        await token(request, installationId, input.id),
        input,
      );
      // Public metadata is visible without an installation grant. Prove the resolved ID is granted.
      if (!input.id) await token(request, installationId, result.id);
      return result;
    },
    async listAlerts(
      installationId: string,
      repo: GithubRepository,
    ): Promise<DependabotAlert[]> {
      const request = operation();
      const accessToken = await token(request, installationId, repo.id);
      const current = await repository(request, accessToken, { id: repo.id });
      const path = `/repos/${current.fullName}/dependabot/alerts`;
      let next: string | null =
        `${origin}${path}?per_page=100&state=open,fixed,dismissed,auto_dismissed`;
      const visited = new Set<string>();
      const alerts: DependabotAlert[] = [];
      const numbers = new Set<number>();
      while (next) {
        if (visited.size >= 20 || visited.has(next))
          throw new GithubError("response_limit");
        visited.add(next);
        const result = await request(next, accessToken);
        for (const alert of parse(
          z.array(alertSchema).max(100),
          result.value,
        )) {
          if (numbers.has(alert.number))
            throw new GithubError("invalid_response");
          numbers.add(alert.number);
          if (
            alert.html_url !==
            `https://github.com/${current.fullName}/security/dependabot/${alert.number}`
          )
            throw new GithubError("invalid_response");
          alerts.push({
            number: alert.number,
            state: alert.state,
            summary: alert.security_advisory.summary,
            description: alert.security_advisory.description.slice(0, 32_000),
            severity: alert.security_vulnerability.severity,
            packageName: alert.dependency.package.name,
            ecosystem: alert.dependency.package.ecosystem,
            manifestPath: alert.dependency.manifest_path,
            ghsaId: alert.security_advisory.ghsa_id,
            cveId: alert.security_advisory.cve_id,
            vulnerableRange:
              alert.security_vulnerability.vulnerable_version_range,
            patchedVersion:
              alert.security_vulnerability.first_patched_version?.identifier ??
              null,
            createdAt: alert.created_at,
            updatedAt: alert.updated_at,
            url: alert.html_url,
          });
        }
        next = null;
        if (result.link) {
          if (result.link.length > 8_192)
            throw new GithubError("response_limit");
          const links = result.link.split(/,(?=\s*<)/);
          for (const link of links) {
            const match = link.trim().match(/^<([^>]+)>;\s*rel="([a-z ]+)"$/);
            if (!match) throw new GithubError("invalid_response");
            if (match[2].split(" ").includes("next")) {
              let url: URL;
              try {
                url = new URL(match[1]);
              } catch {
                throw new GithubError("invalid_response");
              }
              if (
                next ||
                url.origin !== origin ||
                url.pathname !== path ||
                url.username ||
                url.password ||
                url.hash ||
                [...url.searchParams.keys()].some(
                  (key) =>
                    ![
                      "per_page",
                      "state",
                      "before",
                      "after",
                      "sort",
                      "direction",
                    ].includes(key),
                )
              )
                throw new GithubError("invalid_response");
              next = url.toString();
            }
          }
        }
      }
      return alerts;
    },
  };
}
