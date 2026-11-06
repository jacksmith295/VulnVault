export type GithubInstallation = {
  id: string;
  appId: string;
  accountId: string;
  accountLogin: string;
  accountType: "User" | "Organization";
};

export type GithubRepository = { id: string; fullName: string; url: string };

export type DependabotAlert = {
  number: number;
  state: "open" | "fixed" | "dismissed" | "auto_dismissed";
  summary: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  packageName: string;
  ecosystem: string;
  manifestPath: string;
  ghsaId: string;
  cveId: string | null;
  vulnerableRange: string;
  patchedVersion: string | null;
  createdAt: string;
  updatedAt: string;
  url: string;
};

export type GithubErrorCode =
  | "not_configured"
  | "configuration"
  | "unavailable"
  | "rate_limited"
  | "network"
  | "invalid_response"
  | "response_limit";

const messages: Record<GithubErrorCode, string> = {
  not_configured: "GitHub App configuration is required on the server.",
  configuration: "Check the server GitHub App configuration.",
  unavailable:
    "GitHub access is unavailable. Check the App installation, repository access, permissions, and Dependabot alerts settings.",
  rate_limited:
    "GitHub has temporarily limited requests. Sync will retry later.",
  network: "GitHub could not be reached. Sync will retry later.",
  invalid_response:
    "GitHub returned an unexpected response. No alerts were imported.",
  response_limit:
    "The GitHub response exceeded the supported sync limits. No alerts were imported.",
};

export class GithubError extends Error {
  constructor(
    public readonly code: GithubErrorCode,
    public readonly retryAt?: Date,
  ) {
    super(messages[code]);
    this.name = "GithubError";
  }
}

export function githubErrorMessage(error: unknown): string {
  return error instanceof GithubError ? error.message : messages.network;
}
