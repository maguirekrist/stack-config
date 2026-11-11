# stack-config

The lint setup and coding standards shared by projects built on Foldkit, Effect and Alchemy Domain. Read this before changing a project's lint setup, or when a rule seems to stand in your way. Review reads [CODING_STANDARDS.md](CODING_STANDARDS.md).

## What runs

The rules start from what the stack's authors run:

- **Effect:** every rule Effect recommends (its `strict` preset), as errors, every rule of its `style` preset but `missing-pipeable-signature`, and its native-API rules inside Effect code, as Alchemy runs them. Effect is imported by name from its barrels, `import { Effect, Schema } from "effect"`.
- **Oxlint:** its `correctness`, `suspicious` and `perf` groups, the type-safety TypeScript rules, and the TypeScript and unicorn rules Alchemy adds.
- **Foldkit:** its recommended rules, in a project's Foldkit app folders only.
- **Our own:** a few rules kept because they make the code clearer, including `stack/no-disable-comments` from this package's plugin. `stack/prefer-tagged-union` makes every tagged union an Effect Schema, its types taken from `typeof Union.Type`, and `stack/no-tagged-literal` makes its values with `Union.cases.Case.make`, never as a `{ _tag }` object. A recursive union's hand-written types, and code that runs where Effect can't load, are path exceptions to both rules. A project whose tests write expected values as literals switches `stack/no-tagged-literal` off for its test paths. `stack/type-from-schema` keeps a type and its schema from drifting apart: a type named after a schema is `typeof X.Type`. A schema that refers to itself declares its other fields once as `XFields`, and its interface extends `Schema.Struct.Type<typeof XFields>` with only the field that refers back. `stack/mapper-with-its-type` keeps a function that maps one type into another with one of them, as part of that type's companion. It reads syntax, and a mapper builds an imported type with `.make` or an object literal. When the mapper's module declares a type the mapper takes, the mapper is a member of that type's companion, the object or namespace bound to the type's name, or of the companion named after the type it builds. When the module declares none of them, the rule reports a top-level mapper that takes an imported type. A project whose tests build fixtures in test helpers switches it off for its test paths.

[src/oxlint.ts](src/oxlint.ts) is the list, with each choice's reason beside it. A rule earns a place in it only by improving the code; a rule that mostly produces workarounds doesn't.

## Using it

Install it from a tag, beside the tools it configures:

```json
{
  "scripts": { "prepare": "effect-tsgo patch --oxlint && husky" },
  "devDependencies": {
    "@maguirekrist/stack-config": "github:maguirekrist/stack-config#v1.7.0",
    "@effect/tsgo": "0.67.5",
    "@foldkit/oxlint-plugin": "0.15.4",
    "oxlint": "1.90.0",
    "oxlint-tsgolint": "7.0.2005"
  }
}
```

The project's base tsconfig extends this package's, which configures Effect's language service, and leaves `plugins` out of its own compilerOptions:

```json
{
  "extends": "@maguirekrist/stack-config/tsconfig.base.json",
  "compilerOptions": {}
}
```

A project's `oxlint.config.ts` adds only its own paths: its Foldkit app folders, its exceptions and its import boundaries.

```ts
import { defineConfig } from "oxlint";
import * as stack from "@maguirekrist/stack-config/oxlint";

export default defineConfig({
  extends: stack.effectPresets,
  plugins: stack.plugins,
  jsPlugins: stack.jsPlugins,
  categories: stack.categories,
  options: {
    typeAware: true,
    maxWarnings: 0,
    reportUnusedDisableDirectives: "error",
  },
  rules: stack.rules,
  overrides: [...stack.foldkitOverrides(["packages/web"])],
});
```

## The bar

- Lint fails on any warning.
- The pre-commit hook (husky) formats staged files with Prettier through lint-staged, `{ "*": "prettier --ignore-unknown --write" }`, then runs lint, the typecheck and the tests. It never runs a lint fixer, which can change behavior.
- CI runs the project's `check` on every pull request. It's the gate that counts, because `--no-verify` skips hooks.
- Prettier runs on its defaults; a project adds only the plugins its file types need.

## Satisfying a rule

Fix the code the idiomatic way the rule's message describes. Each rule documents itself:

- an Oxlint rule at `https://oxc.rs/docs/guide/usage/linter/rules/<plugin>/<rule>.html`;
- an Effect rule with `gh api repos/Effect-TS/tsgo/contents/docs/rules/<rule>.md --jq .content | base64 -d`.

A fix that only makes the warning go away, such as a constant named for a literal or a parameter object built to get under a count, is not a fix.

## Exceptions

A rule is switched off for a path in the project's `oxlint.config.ts`, with a one-line reason beside it, and only with the project owner's agreement. `stack/no-disable-comments` rejects `eslint-disable`, `oxlint-disable` and `@effect-diagnostics` comments in code. The project's config is the list of its exceptions.

## Changing the shared setup

Change it here and tag a release. Each project takes it by moving its tag, like any other dependency upgrade. `pnpm run check` builds `dist`, which is committed because projects install from git, and fails if `dist` is stale.
