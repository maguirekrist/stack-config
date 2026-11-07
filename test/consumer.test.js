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
