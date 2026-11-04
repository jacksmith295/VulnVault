import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const preparing = process.argv.includes("--prepare");

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}

try {
  let gitRoot;
  try {
    gitRoot = git(["rev-parse", "--show-toplevel"]);
  } catch (error) {
    if (!preparing) throw error;
    console.log("Skipping Git hook setup: no Git checkout is available.");
    process.exit(0);
  }
  if (path.resolve(root) !== path.resolve(gitRoot)) {
    throw new Error("Hook setup must run in the VulnVault repository root.");
  }

  let existing;
  try {
    existing = git(["config", "--get", "core.hooksPath"]);
  } catch (error) {
    if (error.status !== 1) throw error;
  }
  const hooksDirectory = path.resolve(root, git(["rev-parse", "--git-path", "hooks"]));
  const defaultHooks = existing === undefined && existsSync(hooksDirectory)
    ? readdirSync(hooksDirectory).filter((name) => !name.endsWith(".sample"))
    : [];
  if ((existing !== undefined && existing !== ".githooks") || defaultHooks.length) {
    const reason = defaultHooks.length
      ? `the default hooks directory contains custom hooks: ${defaultHooks.map((name) => JSON.stringify(name)).join(", ")}`
      : `core.hooksPath is already ${JSON.stringify(existing)}`;
    const message = `Git hooks were not installed: ${reason}. Integrate .githooks/pre-commit with your existing hooks explicitly.`;
    if (!preparing) throw new Error(message);
    console.warn(message);
  } else {
    git(["config", "--local", "core.hooksPath", ".githooks"]);
    console.log("Repository Git hooks installed from .githooks.");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
