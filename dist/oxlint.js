import foldkitRecommended from "@foldkit/oxlint-plugin/recommended.json" with { type: "json" };
import { effectNative, strict, style } from "@effect/tsgo/oxlint-presets";
/**
 * Every rule Effect recommends, as an error, and every rule of its style
 * preset. Strict comes last so its errors win; the style rules it leaves out
 * stay warnings, which fail lint all the same.
 */
export const effectPresets = [
    style,
    strict,
];
/** Effect's native-API rules that apply inside Effect code, as Alchemy runs them. */
const insideEffect = Object.fromEntries(Object.keys({ ...effectNative.rules })
    .filter((name) => name.endsWith("-in-effect"))
    .map((name) => [name, "error"]));
export const plugins = [
    "typescript",
    "unicorn",
    "oxc",
    "import",
];
export const jsPlugins = [
    ...foldkitRecommended.jsPlugins,
    { name: "stack", specifier: "@maguirekrist/stack-config/plugin" },
];
export const categories = {
    correctness: "error",
    suspicious: "error",
    perf: "error",
};
export const rules = {
    ...insideEffect,
    // Effect rules beyond its defaults that Alchemy also runs.
    "effecttsgo/new-schema-class": "error",
    "effecttsgo/prefer-schema-over-json": "error",
    // Off, as in Alchemy: unstable Effect modules are how this stack is built;
    // Durable Objects and entry points provide and return Effects by design; and
    // a Worker binding needs the runtime context only Alchemy's layer can name.
    "effecttsgo/unstable-api-usage": "off",
    "effecttsgo/strict-effect-provide": "off",
    "effecttsgo/return-effect-in-gen": "off",
    "effecttsgo/leaking-requirements": "off",
    // Off, though Effect's style preset has it: it asks every exported function
    // for a pipeable overload, which is for library APIs. This stack exports
    // framework entry points, such as Foldkit's init, update and view, and
    // helpers called data-first, so the overloads would be wrappers nobody pipes.
    "effecttsgo/missing-pipeable-signature": "off",
    // Type safety.
    "typescript/no-explicit-any": "error",
    "typescript/no-non-null-assertion": "error",
    "typescript/no-unsafe-argument": "error",
    "typescript/no-unsafe-assignment": "error",
    "typescript/no-unsafe-call": "error",
    "typescript/no-unsafe-member-access": "error",
    "typescript/no-unsafe-return": "error",
    "typescript/no-unsafe-type-assertion": "error",
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error",
    "typescript/no-unnecessary-type-assertion": "error",
    "typescript/no-unnecessary-condition": "error",
    "typescript/strict-boolean-expressions": "error",
    "typescript/switch-exhaustiveness-check": "error",
    "typescript/only-throw-error": "error",
    "typescript/consistent-type-imports": "error",
    "typescript/ban-ts-comment": "error",
    // Alchemy's TypeScript and unicorn picks.
    "typescript/await-thenable": "error",
    "typescript/no-array-delete": "error",
    "typescript/no-base-to-string": "error",
    "typescript/no-for-in-array": "error",
    "typescript/no-implied-eval": "error",
    "typescript/no-meaningless-void-operator": "error",
    "typescript/no-misused-spread": "error",
    "typescript/no-redundant-type-constituents": "error",
    "typescript/no-unsafe-unary-minus": "error",
    "typescript/no-wrapper-object-types": "error",
    "typescript/prefer-as-const": "error",
    "typescript/require-array-sort-compare": "error",
    "typescript/restrict-template-expressions": "error",
    "typescript/unbound-method": "error",
    "unicorn/no-new-array": "error",
    "unicorn/no-useless-fallback-in-spread": "error",
    "unicorn/no-useless-length-check": "error",
    "unicorn/no-useless-spread": "error",
    "unicorn/prefer-string-starts-ends-with": "error",
    "no-useless-escape": "error",
    // Our own, each for clearer code.
    // A nested ternary hides a branch; use if/else or Match. Foldkit's rulebook agrees.
    "no-nested-ternary": "error",
    // One way to write an array type, the one Foldkit's rulebook uses.
    "typescript/array-type": ["error", { default: "generic" }],
    // Names say what they hold. h is Foldkit's element builder, _ an unused
    // value, and A, E and R are Effect's type parameters.
    "id-length": ["error", { exceptions: ["h", "_", "A", "E", "R"] }],
    // A function returns a value on every path or on none; absence is an Option.
    "typescript/consistent-return": "error",
    // Patterns match text as Unicode, not as UTF-16 halves.
    "require-unicode-regexp": "error",
    // A service's key names the module that declares it, so keys never collide.
    "effecttsgo/deterministic-keys": "error",
    // A rule is switched off for a path in the config, with its reason, never
    // by a comment in the code.
    "stack/no-disable-comments": "error",
    // A loop says what ends it. Effect code repeats with Stream, Effect.repeat
    // and Schedule, or Effect.forever, instead of a loop it breaks out of.
    "stack/no-infinite-loops": "error",
    "no-constant-condition": ["error", { checkLoops: "all" }],
    // Plain JavaScript hygiene.
    "no-underscore-dangle": ["error", { allow: ["_tag"] }],
    "import/no-unassigned-import": ["error", { allow: ["**/*.css"] }],
    eqeqeq: "error",
    curly: ["error", "all"],
    "no-debugger": "error",
    "no-var": "error",
    "prefer-const": "error",
};
/** Foldkit's presets name only "error" and "off". */
const foldkitRules = (presetRules) => Object.fromEntries(Object.entries(presetRules).map(([name, severity]) => [
    name,
    severity === "off" ? "off" : "error",
]));
/** Foldkit's recommended rules and its own overrides, in the given Foldkit app folders. */
export const foldkitOverrides = (apps) => {
    const inApps = (pattern) => apps.map((app) => `${app}/${pattern}`);
    return [
        {
            files: inApps("**/*.ts"),
            rules: foldkitRules(foldkitRecommended.rules),
        },
        ...foldkitRecommended.overrides.map(({ files, excludeFiles, rules: overrideRules }) => ({
            files: files.flatMap(inApps),
            excludeFiles: (excludeFiles ?? []).flatMap(inApps),
            rules: foldkitRules(overrideRules),
        })),
    ];
};
