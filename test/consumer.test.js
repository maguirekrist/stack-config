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

test("a project's config fails on null in a value or a type", () => {
  const run = spawnSync(
    "pnpm",
    ["exec", "oxlint", "-c", "oxlint.config.js", "absence.ts"],
    { cwd: consumer, encoding: "utf8" },
  );
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /stack\(prefer-option\)/u);
});

test("a project's config fails on a hand-written tagged union and its hand-built value", () => {
  const run = spawnSync(
    "pnpm",
    ["exec", "oxlint", "-c", "oxlint.config.js", "tagged.ts"],
    { cwd: consumer, encoding: "utf8" },
  );
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /stack\(prefer-tagged-union\)/u);
  assert.match(run.stdout, /stack\(no-tagged-literal\)/u);
});

test("a project's config fails on a type written beside its schema", () => {
  const run = spawnSync(
    "pnpm",
    ["exec", "oxlint", "-c", "oxlint.config.js", "schema.ts"],
    { cwd: consumer, encoding: "utf8" },
  );
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /stack\(type-from-schema\)/u);
});

test("a project's config fails on a function that maps types it lives with neither of", () => {
  const run = spawnSync(
    "pnpm",
    ["exec", "oxlint", "-c", "oxlint.config.js", "mapper.ts"],
    { cwd: consumer, encoding: "utf8" },
  );
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /stack\(mapper-with-its-type\)/u);
});

test("a project's config passes a Foldkit page's update helpers in their own module", () => {
  const run = spawnSync(
    "pnpm",
    ["exec", "oxlint", "-c", "oxlint.config.js", "page/Changes.ts"],
    { cwd: consumer, encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
