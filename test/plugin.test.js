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
    {
      ...ts(
        'import { Schema } from "effect";\nconst Notice = Schema.Union([Schema.String, Schema.Null]);',
      ),
      errors: [{ messageId: "schema" }],
    },
  ],
});

const literal = [{ messageId: "literal" }];

new RuleTester().run("no-tagged-literal", plugin.rules["no-tagged-literal"], {
  valid: [
    ts(
      'import { Schema } from "effect";\nconst Holding = Schema.TaggedUnion({ Answered: { value: Schema.String }, Unanswered: {} });\nconst held = Holding.cases.Unanswered.make({});',
    ),
    ts(
      'import { Schema } from "effect";\nconst Answered = Schema.TaggedStruct("Answered", { value: Schema.String });\nconst held = Answered.make({ value: "yes" });',
    ),
    ts("declare const held: object;\nconst { _tag } = Object(held);"),
    ts(
      'import { Schema } from "effect";\nclass A extends Schema.Class<A>("A")({ _tag: Schema.tag("A") }) {}',
    ),
    ts(
      'import { Schema } from "effect";\ndeclare const X: Schema.Codec<unknown>;\nconst bad = Schema.decodeUnknownSync(X)({ _tag: "Bogus" });',
    ),
    ts(
      'import { Schema } from "effect";\nconst Old = Schema.Struct({ _tag: Schema.Literal("Old") });',
    ),
    ts('declare const held: unknown;\nconst named = { tag: "Answered" };'),
    ts(
      'declare const reason: "Timeout" | "Gone";\nconst refused = { _tag: reason };',
    ),
  ],
  invalid: [
    {
      ...ts('const held = { _tag: "Answered", value: "yes" };'),
      errors: literal,
    },
    { ...ts('const held = { "_tag": "Unanswered" };'), errors: literal },
    {
      ...ts('const passed = { _tag: "Passed" as const };'),
      errors: literal,
    },
    {
      ...ts(
        'import type { SessionEvent } from "./SessionLifecycle.ts";\nconst requested = (at: number): SessionEvent => ({ _tag: "MachineRequested", at });',
      ),
      errors: literal,
    },
    {
      ...ts(
        'import { Finished } from "./Finished.ts";\nconst done = Finished.make({ outcome: { _tag: "Uncertain" } });',
      ),
      errors: literal,
    },
  ],
});

new RuleTester().run(
  "prefer-tagged-union",
  plugin.rules["prefer-tagged-union"],
  {
    valid: [
      ts(
        'import { Schema } from "effect";\nconst Holding = Schema.TaggedUnion({ Answered: { value: Schema.String }, Unanswered: {} });\nconst held = Holding.cases.Unanswered.make({});',
      ),
      ts(
        'import { Schema } from "effect";\nconst Seen = Schema.Union([Schema.String, Schema.Number]);',
      ),
      ts(
        "const tagOf = <E extends { readonly _tag: string }>(error: E) => error._tag;",
      ),
      ts(
        'import { Schema } from "effect";\nconst Length = Schema.Union([\n  Schema.TaggedStruct("Length", { question: Schema.String }),\n  Schema.TaggedStruct("Length", { term: Schema.Number }),\n]);',
      ),
      ts(
        'import { Schema } from "effect";\nconst Either = Schema.Union([Schema.TaggedStruct("A", {}), Schema.TaggedStruct("B", {})], { mode: "oneOf" });',
      ),
      ts('const held = { _tag: "Answered", value: "yes" };'),
    ],
    invalid: [
      {
        ...ts(
          'type Holding =\n  | { readonly _tag: "Answered"; readonly value: string }\n  | { readonly _tag: "Unanswered" };',
        ),
        errors: [{ messageId: "type" }, { messageId: "type" }],
      },
      {
        ...ts('type Side = { readonly _tag: "Left" | "Right" };'),
        errors: [{ messageId: "type" }],
      },
      {
        ...ts(
          'interface Answered { readonly _tag: "Answered" }\ntype Only = Extract<Answered, { _tag: "Answered" }>;',
        ),
        errors: [{ messageId: "type" }, { messageId: "type" }],
      },
      {
        ...ts(
          'import { Schema } from "effect";\nconst Holding = Schema.Union([\n  Schema.TaggedStruct("Answered", { value: Schema.String }),\n  Schema.TaggedStruct("Unanswered", {}),\n]);',
        ),
        errors: [{ messageId: "union" }],
      },
    ],
  },
);

const drift = [{ messageId: "drift" }];

new RuleTester().run("type-from-schema", plugin.rules["type-from-schema"], {
  valid: [
    ts(
      'import { Schema } from "effect";\nexport const Book = Schema.Struct({ title: Schema.String });\nexport type Book = typeof Book.Type;',
    ),
    ts(
      'import { Schema } from "effect";\nexport const Id = Schema.String.pipe(Schema.brand("Id"));\nexport type Id = typeof Id.Type;',
    ),
    ts(
      'import { Schema } from "effect";\nconst LocatorFields = { nth: Schema.optionalKey(Schema.Int) };\nexport interface Locator extends Schema.Struct.Type<typeof LocatorFields> {\n  readonly within?: Locator;\n}\nexport const Locator = Schema.Struct({\n  ...LocatorFields,\n  within: Schema.optionalKey(Schema.suspend((): Schema.Codec<Locator> => Locator)),\n});',
    ),
    ts(
      'import { Data } from "effect";\nexport type Endpoint = Data.TaggedEnum<{ Cdp: { readonly url: string } }>;\nexport const Endpoint = Data.taggedEnum<Endpoint>();',
    ),
    ts(
      "export interface Point { readonly left: number; readonly top: number }",
    ),
  ],
  invalid: [
    {
      ...ts(
        'import { Schema } from "effect";\nexport interface Book { readonly title: string }\nexport const Book = Schema.Struct({ title: Schema.String });',
      ),
      errors: drift,
    },
    {
      ...ts(
        'import { Schema } from "effect";\nexport type Book = { readonly title: string };\nexport const Book = Schema.Struct({ title: Schema.String });',
      ),
      errors: drift,
    },
    {
      ...ts(
        'import { Schema } from "effect";\nexport const Protocol = Schema.Literals(["Cdp", "Bidi"]);\nexport type Protocol = "Cdp" | "Bidi";',
      ),
      errors: drift,
    },
    {
      ...ts(
        'import { Schema } from "effect";\nexport const Book = Schema.Struct({ title: Schema.String });\nexport type Book = typeof Book.Encoded;',
      ),
      errors: drift,
    },
    {
      ...ts(
        'import { Schema } from "effect";\nexport interface Locator {\n  readonly within?: Locator;\n  readonly nth?: number;\n}\nexport const Locator = Schema.Struct({\n  nth: Schema.optionalKey(Schema.Int),\n  within: Schema.optionalKey(Schema.suspend((): Schema.Codec<Locator> => Locator)),\n});',
      ),
      errors: drift,
    },
    {
      ...ts(
        'import { Schema } from "effect";\nconst Other = { nth: Schema.optionalKey(Schema.Int) };\nexport interface Locator extends Schema.Struct.Type<typeof Other> {\n  readonly within?: Locator;\n}\nexport const Locator = Schema.Struct({ ...Other });',
      ),
      errors: drift,
    },
  ],
});
