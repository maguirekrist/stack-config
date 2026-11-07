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
