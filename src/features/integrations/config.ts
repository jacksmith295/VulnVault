import "server-only";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { createPrivateKey } from "node:crypto";
import { GithubError } from "./types";

export type GithubConfig = { appId: string; privateKey: string };

export function isGithubConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY_FILE,
  );
}

export function readGithubConfig(): GithubConfig | null {
  const appId = process.env.GITHUB_APP_ID;
  const keyFile = process.env.GITHUB_APP_PRIVATE_KEY_FILE;
  if (!appId && !keyFile) return null;
  if (!appId || !/^[1-9]\d*$/.test(appId) || !keyFile || !isAbsolute(keyFile))
    throw new GithubError("configuration");
  try {
    const keyPath = realpathSync(keyFile);
    const repoPath = process.cwd();
    const inside = relative(repoPath, keyPath);
    if (
      !inside ||
      (inside !== ".." && !inside.startsWith("../") && !isAbsolute(inside))
    )
      throw new Error();
    const stat = statSync(keyPath);
    if (!stat.isFile() || stat.size > 32_768) throw new Error();
    const privateKey = readFileSync(keyPath, "utf8");
    if (createPrivateKey(privateKey).asymmetricKeyType !== "rsa")
      throw new Error();
    return { appId, privateKey };
  } catch {
    throw new GithubError("configuration");
  }
}
