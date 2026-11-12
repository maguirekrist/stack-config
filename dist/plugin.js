import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
 * Whether a callee is reached from `Schema`, as in `Schema.Struct`,
 * `Schema.Class<A>("A")` or `Schema.decodeSync(X)`: its object arguments define
 * a schema or are encoded input, not values.
 */
const rootsAtSchema = (callee) => {
    if (callee.type === "Identifier") {
        return callee.name === "Schema";
    }
    if (callee.type === "MemberExpression") {
        return rootsAtSchema(callee.object);
    }
    if (callee.type === "CallExpression") {
        return rootsAtSchema(callee.callee);
    }
    return false;
};
/**
 * Whether a `_tag` type names cases: a string literal, or a union of them. A
 * bound such as `{ readonly _tag: string }` asks only that a value has a tag.
 */
const namesCases = (type) => (type.type === "TSLiteralType" && type.literal.type === "Literal") ||
    (type.type === "TSUnionType" && type.types.every(namesCases));
/** Whether a value is a string literal, `"Tag"` or `"Tag" as const`. */
const isString = (node) => node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression"
    ? isString(node.expression)
    : node.type === "Literal" && typeof node.value === "string";
/**
 * A tagged value is made by its type's own constructor, so its tag and fields
 * are checked where the type is declared. The rule reads syntax, so it reports
 * an object literal whose `_tag` is a string. An object handed to a `Schema`
 * call defines a schema or is encoded input, so it is left alone.
 */
const noTaggedLiteral = {
    meta: {
        type: "suggestion",
        docs: {
            description: "A tagged value is made with its schema's constructor, never written as a { _tag } object.",
        },
        messages: {
            literal: "Make a tagged value with its schema's constructor: Union.cases.Case.make({ ... }) for a Schema.TaggedUnion, X.make({ ... }) for a Schema.TaggedStruct or a Schema.Class, and new for a Schema.TaggedError. If its type isn't a schema, declare it as one, or as a Data.TaggedEnum, whose constructors make its values.",
        },
    },
    create: (context) => ({
        ObjectExpression: (node) => {
            const tag = node.properties.find((property) => property.type === "Property" &&
                !property.computed &&
                isTagKey(property.key) &&
                isString(property.value));
            if (tag === undefined) {
                return;
            }
            const { parent } = node;
            if (parent.type === "CallExpression" &&
                parent.arguments.includes(node) &&
                rootsAtSchema(parent.callee)) {
                return;
            }
            context.report({ messageId: "literal", node: tag });
        },
    }),
};
/**
 * A tagged union is an Effect Schema, so each union is declared one way and
 * gets its constructors, guards and `match` from the schema. The rule reads
 * syntax, not types, so it reports every hand-written tagged type: a type with
 * a `_tag` member, and a `Schema.Union` of inline `Schema.TaggedStruct`s with
 * distinct tags. `stack/no-tagged-literal` reports the values.
 */
const preferTaggedUnion = {
    meta: {
        type: "suggestion",
        docs: {
            description: "A tagged union is a Schema.TaggedUnion, its types taken from the schema.",
        },
        messages: {
            type: "Declare a tagged type as a schema: Schema.TaggedUnion for a union, Schema.TaggedStruct for one case. Take its type with typeof Union.Type, and one case's with typeof Union.cases.Case.Type.",
            union: "A union of tagged structs is Schema.TaggedUnion({ Case: { ...fields } }), which gives cases, guards and match.",
        },
    },
    create: (context) => ({
        TSPropertySignature: (node) => {
            if (!node.computed &&
                isTagKey(node.key) &&
                node.typeAnnotation !== null &&
                namesCases(node.typeAnnotation.typeAnnotation)) {
                context.report({ messageId: "type", node });
            }
        },
        CallExpression: (node) => {
            if (!isSchemaCall(node, "Union")) {
                return;
            }
            const [members, ...options] = node.arguments;
            if (members?.type !== "ArrayExpression" || options.length > 0) {
                return;
            }
            const tags = members.elements.map((member) => member !== null &&
                isSchemaCall(member, "TaggedStruct") &&
                member.type === "CallExpression" &&
                member.arguments[0]?.type === "Literal" &&
                typeof member.arguments[0].value === "string"
                ? member.arguments[0].value
                : undefined);
            if (tags.length > 0 &&
                tags.every((tag) => tag !== undefined) &&
                new Set(tags).size === tags.length) {
                context.report({ messageId: "union", node: node.callee });
            }
        },
    }),
};
/** Whether a type is `typeof <name>.Type`. */
const isTypeOf = (type, name) => type.type === "TSTypeQuery" &&
    type.exprName.type === "TSQualifiedName" &&
    type.exprName.left.type === "Identifier" &&
    type.exprName.left.name === name &&
    type.exprName.right.name === "Type";
/** Whether an expression is `Schema.Struct.Type`. */
const isStructType = (node) => node.type === "MemberExpression" &&
    node.property.type === "Identifier" &&
    node.property.name === "Type" &&
    node.object.type === "MemberExpression" &&
    node.object.property.type === "Identifier" &&
    node.object.property.name === "Struct" &&
    node.object.object.type === "Identifier" &&
    node.object.object.name === "Schema";
/** Whether an interface extends `Schema.Struct.Type<typeof <name>Fields>`. */
const extendsItsFields = (node, name) => node.extends.some(({ expression, typeArguments }) => {
    const [fields] = typeArguments?.params ?? [];
    return (isStructType(expression) &&
        fields !== undefined &&
        fields.type === "TSTypeQuery" &&
        fields.exprName.type === "Identifier" &&
        fields.exprName.name === `${name}Fields`);
});
/** A module's top-level statement, with an `export` taken off. */
const declared = (statement) => statement.type === "ExportNamedDeclaration"
    ? (statement.declaration ?? undefined)
    : statement;
/**
 * A type named after a schema is the schema's own `Type`, so the two can't
 * drift apart. A schema that refers to itself needs a written type to break
 * the cycle: its other fields are declared once, as `<Name>Fields`, and its
 * interface extends `Schema.Struct.Type<typeof <Name>Fields>` with only the
 * field that refers back. The rule reads syntax, so a schema is a top-level
 * `const` reached from `Schema`.
 */
const typeFromSchema = {
    meta: {
        type: "problem",
        docs: {
            description: "A type named after a schema is `typeof X.Type`, or, for a schema that refers to itself, an interface extending `Schema.Struct.Type<typeof XFields>`.",
        },
        messages: {
            drift: "Write `type {{name}} = typeof {{name}}.Type`, so the type and the schema can't drift apart. If {{name}} refers to itself, declare its other fields once as `{{name}}Fields`, spread them into the schema, and write `interface {{name}} extends Schema.Struct.Type<typeof {{name}}Fields>` with only the field that refers back.",
        },
    },
    create: (context) => ({
        Program: (program) => {
            const statements = program.body.flatMap((statement) => {
                const node = declared(statement);
                return node === undefined ? [] : [node];
            });
            const schemas = new Set(statements.flatMap((node) => node.type === "VariableDeclaration"
                ? node.declarations.flatMap(({ id, init }) => id.type === "Identifier" &&
                    init !== null &&
                    init !== undefined &&
                    rootsAtSchema(init)
                    ? [id.name]
                    : [])
                : []));
            for (const node of statements) {
                if (node.type === "TSTypeAliasDeclaration") {
                    const { name } = node.id;
                    if (schemas.has(name) && !isTypeOf(node.typeAnnotation, name)) {
                        context.report({
                            messageId: "drift",
                            node: node.id,
                            data: { name },
                        });
                    }
                }
                if (node.type === "TSInterfaceDeclaration") {
                    const { name } = node.id;
                    if (schemas.has(name) && !extendsItsFields(node, name)) {
                        context.report({
                            messageId: "drift",
                            node: node.id,
                            data: { name },
                        });
                    }
                }
            }
        },
    }),
};
const moduleNames = (program) => ({
    imports: new Map(program.body.flatMap((statement) => statement.type === "ImportDeclaration"
        ? statement.specifiers.map(({ local }) => [
            local.name,
            statement.source.value,
        ])
        : [])),
    types: new Set(program.body.flatMap((statement) => {
        const node = declared(statement);
        return node !== undefined &&
            (node.type === "TSTypeAliasDeclaration" ||
                node.type === "TSInterfaceDeclaration" ||
                node.type === "TSEnumDeclaration" ||
                node.type === "ClassDeclaration") &&
            node.id !== null
            ? [node.id.name]
            : [];
    })),
});
/**
 * Effect's and Foldkit's own values make no domain value: Effect's
 * constructors, such as `Ref.make`, and Foldkit's program results, an init's
 * or update's `Update.Return` and a view's `Document`.
 */
const from = (...frameworks) => (source) => frameworks.some((framework) => source === framework ||
    source.startsWith(`${framework}/`) ||
    source.startsWith(`@${framework}/`));
const isFramework = from("effect", "foldkit");
const isFoldkit = from("foldkit");
const IMPORT = /\bimport\s+(?:type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/gu;
const ALIAS = /\btype\s+([\w$]+)\s*(?:<[^=]*>)?=\s*([\w$]+)/gu;
/** The local names an import clause binds: `B` in `{ A as B }`, `X` in `* as X`. */
const bound = (clause) => {
    const words = clause
        .split(/[\s{},]+/u)
        .filter((word) => word !== "" && word !== "*" && word !== "type");
    return words.filter((word, at) => word !== "as" && words[at + 1] !== "as");
};
/**
 * The aliases a module's text declares of a Foldkit type, such as a Foldkit
 * page's `type UpdateReturn = Update.Return<Model, Message>` in its Model.ts,
 * which the page's update helpers import. An alias of an Effect type, such as
 * `Schema.Schema.Type<typeof Field>`, still names a domain value.
 */
const frameworkAliases = (text) => {
    const frameworks = new Set([...text.matchAll(IMPORT)].flatMap(([, clause = "", source = ""]) => isFoldkit(source) ? bound(clause) : []));
    return new Set([...text.matchAll(ALIAS)].flatMap(([, name = "", root = ""]) => frameworks.has(root) ? [name] : []));
};
/** The name a type or value is reached through: `Event` in `Event.cases.Requested`. */
const rootName = (node) => {
    if (node.type === "Identifier") {
        return node.name;
    }
    if (node.type === "TSQualifiedName") {
        return rootName(node.left);
    }
    if (node.type === "MemberExpression") {
        return rootName(node.object);
    }
    return undefined;
};
/** The names a type annotation refers to, inside unions, arrays, object types and type arguments too. */
const typeNames = (type) => {
    switch (type.type) {
        case "TSTypeReference": {
            const name = rootName(type.typeName);
            return [
                ...(name === undefined ? [] : [name]),
                ...(type.typeArguments?.params ?? []).flatMap(typeNames),
            ];
        }
        case "TSUnionType":
        case "TSIntersectionType":
            return type.types.flatMap(typeNames);
        case "TSArrayType":
            return typeNames(type.elementType);
        case "TSTypeOperator":
            return typeNames(type.typeAnnotation);
        case "TSTypeLiteral":
            return type.members.flatMap((member) => member.type === "TSPropertySignature" && member.typeAnnotation !== null
                ? typeNames(member.typeAnnotation.typeAnnotation)
                : []);
        default:
            return [];
    }
};
const annotationOf = (param) => {
    if (param.type === "AssignmentPattern") {
        return annotationOf(param.left);
    }
    if (param.type === "TSParameterProperty") {
        return undefined;
    }
    return param.typeAnnotation?.typeAnnotation;
};
/**
 * Whether an object literal is a value, not an implementation: an object with
 * a function in it, such as a service or an adapter, has no constructor.
 */
const isData = (node) => node.properties.every((property) => property.type === "SpreadElement" ||
    (!property.method &&
        property.value.type !== "ArrowFunctionExpression" &&
        property.value.type !== "FunctionExpression"));
const atTop = (node) => node?.type === "Program" ||
    ((node?.type === "ExportNamedDeclaration" ||
        node?.type === "ExportDefaultDeclaration") &&
        node.parent.type === "Program");
/** The name of a function declared at the top of its module. */
const topLevelName = (fn) => {
    if (fn.type === "FunctionDeclaration") {
        return fn.id !== null && atTop(fn.parent) ? fn.id : undefined;
    }
    const { parent } = fn;
    return parent.type === "VariableDeclarator" &&
        parent.init === fn &&
        parent.id.type === "Identifier" &&
        atTop(parent.parent.parent)
        ? parent.id
        : undefined;
};
const returnsFrom = (node) => {
    const { parent } = node;
    if (parent === null) {
        return undefined;
    }
    if (parent.type === "ArrowFunctionExpression" ||
        parent.type === "FunctionExpression" ||
        parent.type === "FunctionDeclaration") {
        return parent;
    }
    return returnsFrom(parent);
};
/**
 * A function that maps one type into another is a top-level export of the
 * module that declares one of them, so callers reach it through that module's
 * namespace, as `DraftPage.of`. The rule reads syntax, so a mapper is a
 * top-level function that takes a parameter of a named type and returns a
 * value of another type: a `.make(...)` on a binding, or an object literal of
 * data whose return type is named. A mapper passes when its module declares a
 * type it takes or builds, and is reported when it takes an imported type and
 * its module declares neither. `no-companion-objects` reports a mapper kept in
 * an object or namespace. Construction inside a
 * handler is not a mapper, Effect's and Foldkit's own values make no domain
 * value, an object with functions in it is an implementation, and a function
 * that takes `unknown` parses what a boundary hands over, so it lives at that
 * boundary. A Foldkit page's init, update and view helpers return its program
 * results, so they live in their own modules. Most name the result by an
 * alias, such as `UpdateReturn`, imported from the page's Model.ts, so the rule
 * reads the text of the module a relative import names to see what the alias
 * stands for.
 */
const mapperWithItsType = {
    meta: {
        type: "suggestion",
        docs: {
            description: "A function that maps one type into another is a top-level export of the module that declares one of them.",
        },
        messages: {
            mapper: "`{{name}}` maps {{source}} into {{target}}, but its module declares neither. Move it into the module that declares `{{source}}` or `{{target}}`, as a top-level export, so callers reach it through that module's namespace, as `DraftPage.of`.",
        },
    },
    create: (context) => {
        const { imports, types } = moduleNames(context.sourceCode.ast);
        const aliases = new Map();
        const aliasesOf = (source) => {
            const file = resolve(dirname(context.physicalFilename), source);
            const known = aliases.get(file) ??
                frameworkAliases(existsSync(file) ? readFileSync(file, "utf8") : "");
            aliases.set(file, known);
            return known;
        };
        const ownAliases = frameworkAliases(context.sourceCode.text);
        const domain = (name) => {
            if (name === undefined) {
                return false;
            }
            const source = imports.get(name);
            return (source !== undefined &&
                !isFramework(source) &&
                !(source.startsWith(".") && aliasesOf(source).has(name)));
        };
        const mapped = (name) => domain(name) ||
            (name !== undefined && types.has(name) && !ownAliases.has(name));
        const built = (fn, value) => {
            if (value.type === "ParenthesizedExpression") {
                return built(fn, value.expression);
            }
            if (value.type === "CallExpression" &&
                value.callee.type === "MemberExpression" &&
                !value.callee.computed &&
                value.callee.property.type === "Identifier" &&
                value.callee.property.name === "make") {
                const name = rootName(value.callee.object);
                return mapped(name) ? name : undefined;
            }
            const returned = fn.returnType?.typeAnnotation;
            if (value.type === "ObjectExpression" &&
                isData(value) &&
                returned?.type === "TSTypeReference") {
                const name = rootName(returned.typeName);
                return mapped(name) ? name : undefined;
            }
            return undefined;
        };
        const reported = new Set();
        const check = (fn, value) => {
            const name = topLevelName(fn);
            const target = built(fn, value);
            const annotations = fn.params.flatMap((param) => {
                const annotation = annotationOf(param);
                return annotation === undefined ? [] : [annotation];
            });
            const sources = annotations.flatMap(typeNames);
            if (name === undefined ||
                target === undefined ||
                reported.has(fn) ||
                annotations.some(({ type }) => type === "TSUnknownKeyword") ||
                sources.includes(target)) {
                return;
            }
            const declared = sources.filter((source) => types.has(source));
            const imported = sources.filter((source) => imports.has(source));
            const [source = imported.find(domain) ?? imported[0]] = declared;
            if (source === undefined || declared.length > 0 || types.has(target)) {
                return;
            }
            reported.add(fn);
            context.report({
                messageId: "mapper",
                node: name,
                data: { name: name.name, source, target },
            });
        };
        return {
            ArrowFunctionExpression: (fn) => {
                if (fn.body.type !== "BlockStatement") {
                    check(fn, fn.body);
                }
            },
            ReturnStatement: (node) => {
                const fn = returnsFrom(node);
                if (fn !== undefined && node.argument !== null) {
                    check(fn, node.argument);
                }
            },
        };
    },
};
/** Whether an import source is one of the packages, or a subpath of one: `@app` names every `@app/*` package. */
const under = (packages) => (source) => packages.some((name) => source === name || source.startsWith(`${name}/`));
/** The strings an option lists. */
const listed = (settings, key) => {
    const value = typeof settings === "object" && settings !== null
        ? Reflect.get(settings, key)
        : undefined;
    return Array.isArray(value)
        ? value.filter((item) => typeof item === "string")
        : [];
};
/** A type, schema or namespace is named in PascalCase; a free function or value isn't. */
const CAPITALIZED = /^\p{Lu}/u;
/** Where a camelCase or PascalCase name breaks into words: `parse|URL|For`. */
const WORD_BREAK = /(?<=[\p{Ll}\d])(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})/u;
/** A name's words, `emptyQuestionnaire` → `empty`, `Questionnaire`. */
const wordsOf = (name) => name.split(WORD_BREAK);
/** Words joined back into a lowercase member name, `to`, `Draft` → `toDraft`. */
const memberName = ([first = "", ...rest]) => [
    first === first.toUpperCase()
        ? first.toLowerCase()
        : first.charAt(0).toLowerCase() + first.slice(1),
    ...rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1)),
].join("");
/**
 * Only a utilities package's generic helpers are imported by name. A
 * project's other functions and values are top-level exports of their
 * modules, reached through the module's namespace, as `DraftPage.of` after
 * `import * as DraftPage from "./DraftPage.ts"`. The rule reads syntax, so it
 * reports a value specifier whose imported name doesn't start with a capital,
 * imported from the project's own code: a relative path, or a package the
 * `workspace` option names. The `utilities` packages, external packages, type
 * imports and namespace and default imports are left alone. Through a
 * namespace of the project's own code, it reports a lowercase member whose
 * words repeat one of the namespace's, case aside, so `DraftPage.pageOf` is
 * `DraftPage.of`. A member that is nothing but the repeat, such as a Foldkit
 * view module's `FirmView.view`, is left alone: its name is the role the
 * framework gives it, and there is no shorter one. Type positions such as
 * `DraftPage.DraftPage` and capitalized members are left alone too.
 */
const functionImportsFromUtilities = {
    meta: {
        type: "suggestion",
        docs: {
            description: "Only a utilities package's helpers are imported by name; the project's other functions are reached through their module's namespace, by a name that doesn't repeat it.",
        },
        messages: {
            named: "`{{name}}` is imported by name from the project's own code, and only a utilities package's helpers are. Move a generic helper into the utilities package. Otherwise import its module as a namespace, `import * as DraftPage from \"./DraftPage.ts\"`, and call it as `DraftPage.of`, by a name that doesn't repeat the namespace.",
            stutter: "`{{namespace}}.{{name}}` repeats its namespace. Write `{{namespace}}.{{suggested}}`: the namespace already names the module.",
        },
        schema: [
            {
                type: "object",
                properties: {
                    workspace: { type: "array", items: { type: "string" } },
                    utilities: { type: "array", items: { type: "string" } },
                },
                additionalProperties: false,
            },
        ],
        defaultOptions: [{ workspace: [], utilities: [] }],
    },
    create: (context) => {
        const [settings] = context.options;
        const isWorkspace = under(listed(settings, "workspace"));
        const isUtility = under(listed(settings, "utilities"));
        const isOwn = (source) => source.startsWith(".") || isWorkspace(source);
        const namespaces = new Set(context.sourceCode.ast.body.flatMap((statement) => statement.type === "ImportDeclaration" &&
            statement.importKind !== "type" &&
            isOwn(statement.source.value)
            ? statement.specifiers.flatMap((specifier) => specifier.type === "ImportNamespaceSpecifier"
                ? [specifier.local.name]
                : [])
            : []));
        return {
            MemberExpression: (node) => {
                if (node.computed ||
                    node.object.type !== "Identifier" ||
                    !namespaces.has(node.object.name) ||
                    node.property.type !== "Identifier" ||
                    CAPITALIZED.test(node.property.name)) {
                    return;
                }
                const namespace = node.object.name;
                const { name } = node.property;
                const repeated = new Set(wordsOf(namespace).map((word) => word.toLowerCase()));
                const words = wordsOf(name);
                const kept = words.filter((word) => !repeated.has(word.toLowerCase()));
                if (kept.length === 0 || kept.length === words.length) {
                    return;
                }
                context.report({
                    messageId: "stutter",
                    node,
                    data: { namespace, name, suggested: memberName(kept) },
                });
            },
            ImportDeclaration: (node) => {
                const source = node.source.value;
                if (node.importKind === "type" || isUtility(source) || !isOwn(source)) {
                    return;
                }
                for (const specifier of node.specifiers) {
                    if (specifier.type !== "ImportSpecifier" ||
                        specifier.importKind === "type") {
                        continue;
                    }
                    const { imported } = specifier;
                    const name = imported.type === "Literal" ? imported.value : imported.name;
                    if (!CAPITALIZED.test(name)) {
                        context.report({
                            messageId: "named",
                            node: specifier,
                            data: { name },
                        });
                    }
                }
            },
        };
    },
};
/** An object literal, seen through `as`, `satisfies` and parentheses. */
const objectLiteral = (node) => {
    if (node === null) {
        return undefined;
    }
    if (node.type === "TSAsExpression" ||
        node.type === "TSSatisfiesExpression" ||
        node.type === "ParenthesizedExpression") {
        return objectLiteral(node.expression);
    }
    return node.type === "ObjectExpression" ? node : undefined;
};
/** A PascalCase name, as a module or type has; `OPERATORS` is a constant. */
const PASCAL_CASE = /^\p{Lu}.*\p{Ll}/u;
/** A statement that declares only types. */
const declaresTypes = (statement) => {
    const declaration = statement.type === "ExportNamedDeclaration"
        ? statement.declaration
        : statement;
    return (declaration?.type === "TSInterfaceDeclaration" ||
        declaration?.type === "TSTypeAliasDeclaration");
};
/**
 * A project's functions are top-level exports of a module, so it has no
 * companion objects: no top-level object with a PascalCase name that holds a
 * function, and no namespace that holds a value. Callers reach the functions
 * through the module's namespace instead, as `DraftPage.of`. An object named
 * in camelCase, such as an aggregate's `evolve`, is an implementation, and a
 * constant table such as `OPERATORS` is data, so both pass. Classes, schemas,
 * ambient declarations and namespaces of types pass too.
 */
const noCompanionObjects = {
    meta: {
        type: "suggestion",
        docs: {
            description: "A project's functions are top-level exports of a module, never members of a companion object or namespace.",
        },
        messages: {
            companion: '`{{name}}` is a companion object, and a project has none. Export each of its members as a top-level function of this module, so callers import the module as a namespace, `import * as DraftPage from "./DraftPage.ts"`, and call `DraftPage.of`.',
        },
    },
    create: (context) => ({
        VariableDeclarator: (node) => {
            const object = objectLiteral(node.init);
            if (node.id.type !== "Identifier" ||
                !PASCAL_CASE.test(node.id.name) ||
                !atTop(node.parent.parent) ||
                object === undefined ||
                !object.properties.some((property) => property.type === "Property" &&
                    (property.value.type === "ArrowFunctionExpression" ||
                        property.value.type === "FunctionExpression"))) {
                return;
            }
            context.report({
                messageId: "companion",
                node: node.id,
                data: { name: node.id.name },
            });
        },
        TSModuleDeclaration: (node) => {
            if (node.declare ||
                node.id.type !== "Identifier" ||
                !atTop(node.parent) ||
                node.body?.type !== "TSModuleBlock" ||
                node.body.body.every(declaresTypes)) {
                return;
            }
            context.report({
                messageId: "companion",
                node: node.id,
                data: { name: node.id.name },
            });
        },
    }),
};
/** The shared lint setup's own rules, as `stack/<rule>`. */
const plugin = {
    meta: { name: "stack" },
    rules: {
        "function-imports-from-utilities": functionImportsFromUtilities,
        "mapper-with-its-type": mapperWithItsType,
        "no-companion-objects": noCompanionObjects,
        "no-disable-comments": noDisableComments,
        "no-infinite-loops": noInfiniteLoops,
        "no-tagged-literal": noTaggedLiteral,
        "prefer-option": preferOption,
        "prefer-tagged-union": preferTaggedUnion,
        "type-from-schema": typeFromSchema,
    },
};
export default plugin;
