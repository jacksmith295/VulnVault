import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const project = fileURLToPath(new URL("../../", import.meta.url));

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "vulnvault-hooks-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "--quiet");
  git("config", "user.name", "Hook Test");
  git("config", "user.email", "hooks@example.test");
  git("config", "core.hooksPath", ".githooks");
  for (const file of ["scripts/check-staged-ui.mjs", "scripts/install-hooks.mjs", ".githooks/pre-commit", "eslint.config.mjs"]) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    cpSync(path.join(project, file), path.join(root, file));
  }
  symlinkSync(path.join(project, "node_modules"), path.join(root, "node_modules"), "dir");
  const write = (file, contents) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), contents);
  };
  const stage = (file, contents) => {
    write(file, contents);
    git("add", "--", file);
  };
  const run = (script = "scripts/check-staged-ui.mjs", args = []) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });
  return { root, git, write, stage, run };
}

const valid = "export default function Page() { return null; }\n";
const invalid = "export default function Page() { return <div />; }\n";

test("rejects staged HTML even when the working copy is fixed, without changing either version", (t) => {
  const f = fixture(t);
  const file = "src/app/page.tsx";
  f.stage(file, invalid);
  f.write(file, valid);
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Compose TSX components/);
  assert.match(result.stderr, /stage the fixes/);
  assert.equal(f.git("show", `:${file}`), invalid);
  assert.equal(readFileSync(path.join(f.root, file), "utf8"), valid);
});

test("accepts staged valid code even when the working copy has HTML", (t) => {
  const f = fixture(t);
  f.stage("src/features/example.tsx", valid);
  f.write("src/features/example.tsx", invalid);
  assert.equal(f.run().status, 0);
});

test("JSX files enforce the same component policy as TSX files", (t) => {
  const f = fixture(t);
  const file = "src/features/example.jsx";
  f.stage(file, invalid);
  const rejected = f.run();
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Compose TSX components/);
  f.stage(file, 'function Component() { return null; }\nexport default function Feature() { return <Component />; }\n');
  assert.equal(f.run().status, 0);
});

test("allows shared HTML and the root document layout", (t) => {
  const f = fixture(t);
  f.stage("src/components/ui/example.tsx", invalid);
  f.stage("src/app/layout.tsx", "export default function Layout() { return <html><body /></html>; }\n");
  assert.equal(f.run().status, 0);
});

test("allows feature component markup but still checks ordinary lint rules", (t) => {
  const f = fixture(t);
  const file = "src/features/example/components/nested/Panel.tsx";
  f.stage(file, 'export default function Panel() { return <section className="bg-card"><p>Example</p></section>; }\n');
  assert.equal(f.run().status, 0);
  f.stage(file, 'export default function Panel() { return <section className="bg-card">{[1].map(() => <p>Example</p>)}</section>; }\n');
  const rejected = f.run();
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /react\/jsx-key/);
});

test("route composition still rejects styling overrides on components", (t) => {
  const f = fixture(t);
  f.stage("src/app/page.tsx", 'function Panel() { return null; }\nexport default function Page() { return <Panel className="p-4" />; }\n');
  assert.equal(f.run().status, 1);
});

test("rejects lowercase custom HTML and className overrides using the existing policy", (t) => {
  const f = fixture(t);
  f.stage("src/features/example.tsx", 'export default function Feature() { return <custom-element className="p-4" />; }\n');
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Compose TSX components/);
  assert.match(result.stderr, /Use component variants/);
});

test("handles renamed paths containing spaces and newlines, and skips deletions", (t) => {
  const f = fixture(t);
  f.stage("src/app/original.tsx", invalid);
  f.git("-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "fixture");
  const renamed = "src/features/name with space\nand newline.tsx";
  mkdirSync(path.dirname(path.join(f.root, renamed)), { recursive: true });
  f.git("mv", "src/app/original.tsx", renamed);
  const rejected = f.run();
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Compose TSX components/);
  f.git("rm", "-f", "--", renamed);
  assert.equal(f.run().status, 0);
});

test("fails closed for broken ESLint configuration", (t) => {
  const f = fixture(t);
  f.stage("src/app/page.tsx", valid);
  f.write("eslint.config.mjs", "throw new Error('fixture config failure');\n");
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not run/);
  assert.match(result.stderr, /fixture config failure/);
});

test("checks a symlink replaced with a regular TSX file", (t) => {
  const f = fixture(t);
  const file = "src/app/page.tsx";
  mkdirSync(path.dirname(path.join(f.root, file)), { recursive: true });
  symlinkSync("../shared.tsx", path.join(f.root, file));
  f.git("add", "--", file);
  f.git("-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "fixture");
  rmSync(path.join(f.root, file));
  f.stage(file, invalid);
  assert.equal(f.git("diff", "--cached", "--name-status").trim(), `T\t${file}`);
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Compose TSX components/);
});

test("fails closed for an unmerged index", (t) => {
  const f = fixture(t);
  f.stage("src/app/page.tsx", valid);
  const blob = f.git("rev-parse", ":src/app/page.tsx").trim();
  f.git("update-index", "--force-remove", "src/app/page.tsx");
  execFileSync("git", ["update-index", "--index-info"], {
    cwd: f.root,
    input: `100644 ${blob} 1\tsrc/app/page.tsx\n100644 ${blob} 2\tsrc/app/page.tsx\n`,
  });
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Resolve and stage merge conflicts/);
});

test("fails closed when dependencies are unavailable", (t) => {
  const f = fixture(t);
  f.stage("src/app/page.tsx", valid);
  rmSync(path.join(f.root, "node_modules"));
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /npm ci/);
});

test("the executable hook blocks a real commit", (t) => {
  const f = fixture(t);
  f.stage("src/app/page.tsx", invalid);
  assert.throws(() => f.git("commit", "--quiet", "-m", "should fail"), /Compose TSX components/);
  assert.equal(f.git("diff", "--cached", "--name-only").trim(), "src/app/page.tsx");
});

test("installer sets local hooksPath and refuses to overwrite custom hooks", (t) => {
  const f = fixture(t);
  f.git("config", "--local", "--unset", "core.hooksPath");
  assert.equal(f.run("scripts/install-hooks.mjs").status, 0);
  assert.equal(f.git("config", "--local", "--get", "core.hooksPath").trim(), ".githooks");
  f.git("config", "--local", "core.hooksPath", "custom-hooks");
  const refused = f.run("scripts/install-hooks.mjs");
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /already "custom-hooks"/);
  assert.equal(f.run("scripts/install-hooks.mjs", ["--prepare"]).status, 0);
  assert.equal(f.git("config", "--local", "--get", "core.hooksPath").trim(), "custom-hooks");
});

test("prepare gracefully skips source archives outside Git", (t) => {
  const f = fixture(t);
  rmSync(path.join(f.root, ".git"), { recursive: true });
  const result = f.run("scripts/install-hooks.mjs", ["--prepare"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /no Git checkout/);
});

test("installer preserves default custom hooks when hooksPath is unset", (t) => {
  const f = fixture(t);
  f.git("config", "--local", "--unset", "core.hooksPath");
  f.write(".git/hooks/pre-commit", "#!/bin/sh\nexit 0\n");
  const result = f.run("scripts/install-hooks.mjs");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /default hooks directory contains custom hooks/);
  assert.equal(f.run("scripts/install-hooks.mjs", ["--prepare"]).status, 0);
  assert.throws(() => f.git("config", "--local", "--get", "core.hooksPath"));
  assert.equal(readFileSync(path.join(f.root, ".git/hooks/pre-commit"), "utf8"), "#!/bin/sh\nexit 0\n");
});
