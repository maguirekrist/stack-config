import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const consumer = fileURLToPath(new URL("consumer/", import.meta.url));

test("a project's config loads the plugin and fails on a disable comment", () => {
  const run = spawnSync(
    "pnpm",
    ["exec", "oxlint", "-c", "oxlint.config.js", "disabled.ts"],
    { cwd: consumer, encoding: "utf8" },
  );
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /stack\(no-disable-comments\)/u);
});

test("a project's config fails on a loop written to run forever", () => {
  const run = spawnSync(
    "pnpm",
    ["exec", "oxlint", "-c", "oxlint.config.js", "loops.ts"],
    { cwd: consumer, encoding: "utf8" },
  );
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /stack\(no-infinite-loops\)/u);
  assert.match(run.stdout, /eslint\(no-constant-condition\)/u);
});
