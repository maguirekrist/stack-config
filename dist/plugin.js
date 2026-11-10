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
/** `Schema.NullOr(X)`, and `Schema.Null` as a member of a union. */
const NULL_SCHEMAS = new Set(["NullOr", "Null"]);
/**
 * Absence is an `Option`. `null` stays only on the wire, where
 * `Schema.OptionFromNullOr` turns it into one, and in a comparison, which
 * reading a library's value needs.
 */
const preferOption = {
    meta: {
        type: "suggestion",
        docs: {
            description: "Absence is an Option: no null values, no null in types, and Schema.OptionFromNullOr in place of Schema.NullOr or a union with Schema.Null.",
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
        MemberExpression: (node) => {
            if (node.object.type === "Identifier" &&
                node.object.name === "Schema" &&
                node.property.type === "Identifier" &&
                NULL_SCHEMAS.has(node.property.name)) {
                context.report({ messageId: "schema", node });
            }
        },
    }),
};
/** Whether a property key, plain or quoted, is `_tag`. */
const isTagKey = (key) => (key.type === "Identifier" && key.name === "_tag") ||
    (key.type === "Literal" && key.value === "_tag");
/** Whether a node is the call `Schema.<name>(...)`. */
const isSchemaCall = (node, name) => node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "Schema" &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === name;
/**
 * A tagged union is an Effect Schema, so each union is declared one way and
 * gets its constructors, guards and `match` from the schema. The rule reads
 * syntax, not types, so it reports every hand-written tag: an object literal
 * with a `_tag`, a type with a `_tag` member, and a `Schema.Union` of inline
 * `Schema.TaggedStruct`s. A `_tag` in a `Schema.Struct` is left to Effect's
 * `schema-struct-with-tag`.
 */
const preferTaggedUnion = {
    meta: {
        type: "suggestion",
        docs: {
            description: "A tagged union is a Schema.TaggedUnion, its values made with the schema's constructors and its types taken from the schema.",
        },
        messages: {
            value: "Make a tagged value with its schema's constructor: Union.cases.Case.make({ ... }) for a Schema.TaggedUnion, or Case.make({ ... }) for a Schema.TaggedStruct. A tagged error is a Schema.TaggedErrorClass, made with new.",
            type: "Declare a tagged type as a schema: Schema.TaggedUnion for a union, Schema.TaggedStruct for one case. Take its type with typeof Union.Type, and one case's with typeof Union.cases.Case.Type.",
            union: "A union of tagged structs is Schema.TaggedUnion({ Case: { ...fields } }), which gives cases, guards and match.",
        },
    },
    create: (context) => ({
        ObjectExpression: (node) => {
            const tag = node.properties.find((property) => property.type === "Property" &&
                !property.computed &&
                isTagKey(property.key));
            if (tag === undefined) {
                return;
            }
            if (isSchemaCall(node.parent, "Struct")) {
                return;
            }
            context.report({ messageId: "value", node: tag });
        },
        TSPropertySignature: (node) => {
            if (!node.computed && isTagKey(node.key)) {
                context.report({ messageId: "type", node });
            }
        },
        CallExpression: (node) => {
            if (!isSchemaCall(node, "Union")) {
                return;
            }
            const [members] = node.arguments;
            if (members?.type === "ArrayExpression" &&
                members.elements.length > 0 &&
                members.elements.every((member) => member !== null && isSchemaCall(member, "TaggedStruct"))) {
                context.report({ messageId: "union", node: node.callee });
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
        "prefer-tagged-union": preferTaggedUnion,
    },
};
export default plugin;
