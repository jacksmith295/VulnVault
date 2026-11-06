import { generateKeyPairSync } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isGithubConfigured,
  readGithubConfig,
} from "../../src/features/integrations/config";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  realpathSync: vi.fn(),
  statSync: vi.fn(),
}));

const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();

describe("server GitHub App configuration", () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_APP_ID", "123");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY_FILE", "/tmp/vulnvault-test-key.pem");
    vi.mocked(realpathSync).mockReturnValue("/tmp/vulnvault-test-key.pem");
    vi.mocked(statSync).mockReturnValue({
      isFile: () => true,
      size: privateKey.length,
    } as ReturnType<typeof statSync>);
    vi.mocked(readFileSync).mockReturnValue(privateKey);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it("returns optional unconfigured state without touching the filesystem", () => {
    vi.stubEnv("GITHUB_APP_ID", undefined);
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY_FILE", undefined);
    expect(readGithubConfig()).toBeNull();
    expect(isGithubConfigured()).toBe(false);
    expect(realpathSync).not.toHaveBeenCalled();
  });

  it("checks configured presence without reading secret files", () => {
    expect(isGithubConfigured()).toBe(true);
    expect(readFileSync).not.toHaveBeenCalled();
  });

  it("reads an external RSA key and canonicalizes only the key path", () => {
    expect(readGithubConfig()).toEqual({ appId: "123", privateKey });
    expect(realpathSync).toHaveBeenCalledExactlyOnceWith(
      "/tmp/vulnvault-test-key.pem",
    );
  });

  it("rejects external symlinks that point into the project", () => {
    vi.mocked(realpathSync).mockReturnValue(
      resolve(process.cwd(), "test-key.pem"),
    );
    expect(readGithubConfig).toThrow(
      "Check the server GitHub App configuration.",
    );
    expect(readFileSync).not.toHaveBeenCalled();
  });

  it("rejects malformed and oversized keys with a safe error", () => {
    vi.mocked(readFileSync).mockReturnValue("secret invalid key contents");
    expect(readGithubConfig).toThrow(
      "Check the server GitHub App configuration.",
    );
    vi.mocked(readFileSync).mockClear();
    vi.mocked(statSync).mockReturnValue({
      isFile: () => true,
      size: 32_769,
    } as ReturnType<typeof statSync>);
    expect(readGithubConfig).toThrow(
      "Check the server GitHub App configuration.",
    );
    expect(readFileSync).not.toHaveBeenCalled();
  });

  it("rejects incomplete or relative-path configuration before file access", () => {
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY_FILE", "key.pem");
    expect(readGithubConfig).toThrow(
      "Check the server GitHub App configuration.",
    );
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY_FILE", undefined);
    expect(readGithubConfig).toThrow(
      "Check the server GitHub App configuration.",
    );
    expect(realpathSync).not.toHaveBeenCalled();
  });
});
