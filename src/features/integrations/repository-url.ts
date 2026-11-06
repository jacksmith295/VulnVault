// Repository URLs are candidates only. The provider verifies the immutable identity.
export function parseGithubRepositoryUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    const candidate = url.pathname
      .replace(/\/$/, "")
      .replace(/\.git$/, "")
      .slice(1);
    return candidate.length <= 201 &&
      /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(candidate)
      ? candidate
      : null;
  } catch {
    return null;
  }
}
