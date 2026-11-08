/**
 * A comment that switches lint or Effect's diagnostics off: `eslint-disable`,
 * `oxlint-disable` and their `-next-line` and `enable` forms, and
 * `@effect-diagnostics`. TypeScript's `@ts-` comments are
 * `typescript/ban-ts-comment`'s.
 */
const SWITCH_OFF = /^[\s*]*(?:(?:eslint|oxlint)-(?:disable|enable)|@effect-diagnostics)/u;
const noDisableComments = {
    meta: {
        type: "problem",
        docs: {
            description: "Switch a rule off for a path in the lint config, with its reason, never by a comment in the code.",
        },
        messages: {
            disable: "Fix the code the way the rule describes. If the rule truly doesn't fit, switch it off for the path in oxlint.config.ts with a reason, with the project owner's agreement.",
        },
    },
    create: (context) => ({
        Program: () => {
            for (const comment of context.sourceCode.getAllComments()) {
                if (SWITCH_OFF.test(comment.value)) {
                    context.report({ messageId: "disable", loc: comment.loc });
                }
            }
        },
    }),
};
/**
 * `for (;;)` has no condition, so `no-constant-condition` never sees it. That
 * rule, with `checkLoops: "all"`, catches the other loops written to run
 * forever.
 */
const noInfiniteLoops = {
    meta: {
        type: "suggestion",
        docs: {
            description: "A loop says what ends it, so a `for` statement always has a condition.",
        },
        messages: {
            loop: "A loop with no condition runs until something inside it breaks out. Say what it repeats over: read with a Stream, repeat with Effect.repeat and a Schedule, or use Effect.forever for work that truly never ends.",
        },
    },
    create: (context) => ({
        ForStatement: (node) => {
            if (node.test === null) {
                context.report({ messageId: "loop", node });
            }
        },
    }),
};
const EQUALITY = new Set(["===", "!==", "==", "!="]);
/**
 * Absence is an `Option`. `null` stays only on the wire, where
 * `Schema.OptionFromNullOr` turns it into one, and in a comparison, which
 * reading a library's value needs.
 */
const preferOption = {
    meta: {
        type: "suggestion",
        docs: {
            description: "Absence is an Option: no null values, no null in types, and Schema.OptionFromNullOr in place of Schema.NullOr.",
        },
        messages: {
            value: "Absence is an Option: Option.none() for nothing, Option.some(value) for something. Where a library or the wire hands over null, convert it with Option.fromNullishOr or Schema.OptionFromNullOr.",
            type: "Absence is an Option: write Option<T> in place of T | null. A wire schema decodes null into one with Schema.OptionFromNullOr.",
            schema: "Schema.OptionFromNullOr(X) keeps null on the wire and gives the code an Option.",
        },
    },
    create: (context) => ({
        Literal: (node) => {
            if (node.raw !== "null") {
                return;
            }
            const { parent } = node;
            if (parent.type === "BinaryExpression" && EQUALITY.has(parent.operator)) {
                return;
            }
            context.report({ messageId: "value", node });
        },
        TSNullKeyword: (node) => {
            context.report({ messageId: "type", node });
        },
        CallExpression: (node) => {
            const { callee } = node;
            if (callee.type === "MemberExpression" &&
                callee.object.type === "Identifier" &&
                callee.object.name === "Schema" &&
                callee.property.type === "Identifier" &&
                callee.property.name === "NullOr") {
                context.report({ messageId: "schema", node: callee });
            }
        },
    }),
};
/** The shared lint setup's own rules, as `stack/<rule>`. */
const plugin = {
    meta: { name: "stack" },
    rules: {
        "no-disable-comments": noDisableComments,
        "no-infinite-loops": noInfiniteLoops,
        "prefer-option": preferOption,
    },
};
export default plugin;
