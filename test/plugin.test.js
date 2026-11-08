import { describe, it } from "node:test";
import { RuleTester } from "oxlint/plugins-dev";
import plugin from "@maguirekrist/stack-config/plugin";

RuleTester.describe = describe;
RuleTester.it = it;

const disable = [{ messageId: "disable" }];

new RuleTester().run(
  "no-disable-comments",
  plugin.rules["no-disable-comments"],
  {
    valid: [
      "const answer = 42; // a plain comment",
      "/** Explains why a rule is off, without switching it off. */ const x = 1;",
      "// prettier-ignore\nconst matrix = [1,0, 0,1];",
    ],
    invalid: [
      {
        code: "// oxlint-disable-next-line no-debugger\ndebugger;",
        errors: disable,
      },
      { code: "/* eslint-disable */\nconst x = 1;", errors: disable },
      { code: "// eslint-enable no-console\nconst x = 1;", errors: disable },
      {
        code: "// @effect-diagnostics-next-line multipleCatchTag:off\nconst x = 1;",
        errors: disable,
      },
      {
        code: "/** @effect-diagnostics floatingEffect:off */\nconst x = 1;",
        errors: disable,
      },
    ],
  },
);

const loop = [{ messageId: "loop" }];

new RuleTester().run("no-infinite-loops", plugin.rules["no-infinite-loops"], {
  valid: [
    "for (let i = 0; i < 3; i++) {}",
    "for (const item of [1, 2]) {}",
    "let n = 3; while (n > 0) { n--; }",
  ],
  invalid: [
    { code: "for (;;) { break; }", errors: loop },
    { code: "for (let i = 0; ; i++) { break; }", errors: loop },
  ],
});

const ts = (code) => ({ code, filename: "absence.ts" });

new RuleTester().run("prefer-option", plugin.rules["prefer-option"], {
  valid: [
    ts(
      'import { Option } from "effect";\nconst seen: Option.Option<number> = Option.none();',
    ),
    ts("declare const found: unknown;\nconst missing = found === null;"),
    ts("declare const found: unknown;\nconst present = found != null;"),
    ts(
      'import { Schema } from "effect";\nconst Notice = Schema.OptionFromNullOr(Schema.String);',
    ),
    ts('const label = "null";'),
  ],
  invalid: [
    { ...ts("let watch = null;"), errors: [{ messageId: "value" }] },
    {
      ...ts("const since = (seen: boolean) => (seen ? 1 : null);"),
      errors: [{ messageId: "value" }],
    },
    {
      ...ts("type Watch = number | null;"),
      errors: [{ messageId: "type" }],
    },
    {
      ...ts(
        'import { Schema } from "effect";\nconst Notice = Schema.NullOr(Schema.String);',
      ),
      errors: [{ messageId: "schema" }],
    },
  ],
});
