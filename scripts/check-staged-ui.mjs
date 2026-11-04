import { execFileSync } from "node:child_process";
import path from "node:path";

function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

try {
  const root = git(["rev-parse", "--show-toplevel"]).trimEnd();
  if (git(["ls-files", "--unmerged", "-z"], root)) {
    throw new Error("Resolve and stage merge conflicts before committing.");
  }
  const files = git(
    ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMRT", "--find-renames"],
    root,
  )
    .split("\0")
    .filter((file) => /^src\/(?:app|features)\/[\s\S]*\.(?:jsx|tsx)$/.test(file));

  if (files.length) {
    const { ESLint } = await import("eslint");
    const eslint = new ESLint({ cwd: root });
    const results = [];
    for (const file of files) {
      const source = git(["show", `:${file}`], root);
      results.push(...(await eslint.lintText(source, { filePath: path.join(root, file) })));
    }
    if (results.some((result) => result.errorCount || result.warningCount)) {
      const formatter = await eslint.loadFormatter("stylish");
      process.stderr.write(await formatter.format(results));
      process.stderr.write(
        "\nPre-commit UI check failed. Fix the reported files and stage the fixes before committing. Shared HTML and styling belong in src/components/ui or src/components/layout.\n",
      );
      process.exitCode = 1;
    }
  }
} catch (error) {
  console.error(
    "Pre-commit UI check could not run. Install dependencies with npm ci and check the ESLint configuration, then retry the commit.",
  );
  console.error(error.message);
  process.exitCode = 1;
}
