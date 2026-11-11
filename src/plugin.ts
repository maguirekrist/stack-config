import type { ESTree, Plugin, Rule } from "@oxlint/plugins";

/**
 * A comment that switches lint or Effect's diagnostics off: `eslint-disable`,
 * `oxlint-disable` and their `-next-line` and `enable` forms, and
 * `@effect-diagnostics`. TypeScript's `@ts-` comments are
 * `typescript/ban-ts-comment`'s.
 */
const SWITCH_OFF =
  /^[\s*]*(?:(?:eslint|oxlint)-(?:disable|enable)|@effect-diagnostics)/u;

const noDisableComments: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Switch a rule off for a path in the lint config, with its reason, never by a comment in the code.",
    },
    messages: {
      disable:
        "Fix the code the way the rule describes. If the rule truly doesn't fit, switch it off for the path in oxlint.config.ts with a reason, with the project owner's agreement.",
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
const noInfiniteLoops: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "A loop says what ends it, so a `for` statement always has a condition.",
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
const preferOption: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Absence is an Option: no null values, no null in types, and Schema.OptionFromNullOr in place of Schema.NullOr or a union with Schema.Null.",
    },
    messages: {
      value:
        "Absence is an Option: Option.none() for nothing, Option.some(value) for something. Where a library or the wire hands over null, convert it with Option.fromNullishOr or Schema.OptionFromNullOr.",
      type: "Absence is an Option: write Option<T> in place of T | null. A wire schema decodes null into one with Schema.OptionFromNullOr.",
      schema:
        "Schema.OptionFromNullOr(X) keeps null on the wire and gives the code an Option.",
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
      if (
        node.object.type === "Identifier" &&
        node.object.name === "Schema" &&
        node.property.type === "Identifier" &&
        NULL_SCHEMAS.has(node.property.name)
      ) {
        context.report({ messageId: "schema", node });
      }
    },
  }),
};

/** Whether a property key, plain or quoted, is `_tag`. */
const isTagKey = (key: ESTree.PropertyKey): boolean =>
  (key.type === "Identifier" && key.name === "_tag") ||
  (key.type === "Literal" && key.value === "_tag");

/** Whether a node is the call `Schema.<name>(...)`. */
const isSchemaCall = (node: ESTree.Node, name: string): boolean =>
  node.type === "CallExpression" &&
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
const rootsAtSchema = (callee: ESTree.Node): boolean => {
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
const namesCases = (type: ESTree.TSType): boolean =>
  (type.type === "TSLiteralType" && type.literal.type === "Literal") ||
  (type.type === "TSUnionType" && type.types.every(namesCases));

/** Whether a value is a string literal, `"Tag"` or `"Tag" as const`. */
const isString = (node: ESTree.Node): boolean =>
  node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression"
    ? isString(node.expression)
    : node.type === "Literal" && typeof node.value === "string";

/**
 * A tagged value is made by its type's own constructor, so its tag and fields
 * are checked where the type is declared. The rule reads syntax, so it reports
 * an object literal whose `_tag` is a string. An object handed to a `Schema`
 * call defines a schema or is encoded input, so it is left alone.
 */
const noTaggedLiteral: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "A tagged value is made with its schema's constructor, never written as a { _tag } object.",
    },
    messages: {
      literal:
        "Make a tagged value with its schema's constructor: Union.cases.Case.make({ ... }) for a Schema.TaggedUnion, X.make({ ... }) for a Schema.TaggedStruct or a Schema.Class, and new for a Schema.TaggedError. If its type isn't a schema, declare it as one, or as a Data.TaggedEnum, whose constructors make its values.",
    },
  },
  create: (context) => ({
    ObjectExpression: (node) => {
      const tag = node.properties.find(
        (property) =>
          property.type === "Property" &&
          !property.computed &&
          isTagKey(property.key) &&
          isString(property.value),
      );
      if (tag === undefined) {
        return;
      }
      const { parent } = node;
      if (
        parent.type === "CallExpression" &&
        parent.arguments.includes(node) &&
        rootsAtSchema(parent.callee)
      ) {
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
const preferTaggedUnion: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "A tagged union is a Schema.TaggedUnion, its types taken from the schema.",
    },
    messages: {
      type: "Declare a tagged type as a schema: Schema.TaggedUnion for a union, Schema.TaggedStruct for one case. Take its type with typeof Union.Type, and one case's with typeof Union.cases.Case.Type.",
      union:
        "A union of tagged structs is Schema.TaggedUnion({ Case: { ...fields } }), which gives cases, guards and match.",
    },
  },
  create: (context) => ({
    TSPropertySignature: (node) => {
      if (
        !node.computed &&
        isTagKey(node.key) &&
        node.typeAnnotation !== null &&
        namesCases(node.typeAnnotation.typeAnnotation)
      ) {
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
      const tags = members.elements.map((member) =>
        member !== null &&
        isSchemaCall(member, "TaggedStruct") &&
        member.type === "CallExpression" &&
        member.arguments[0]?.type === "Literal" &&
        typeof member.arguments[0].value === "string"
          ? member.arguments[0].value
          : undefined,
      );
      if (
        tags.length > 0 &&
        tags.every((tag) => tag !== undefined) &&
        new Set(tags).size === tags.length
      ) {
        context.report({ messageId: "union", node: node.callee });
      }
    },
  }),
};

/** Whether a type is `typeof <name>.Type`. */
const isTypeOf = (type: ESTree.TSType, name: string): boolean =>
  type.type === "TSTypeQuery" &&
  type.exprName.type === "TSQualifiedName" &&
  type.exprName.left.type === "Identifier" &&
  type.exprName.left.name === name &&
  type.exprName.right.name === "Type";

/** Whether an expression is `Schema.Struct.Type`. */
const isStructType = (node: ESTree.Node): boolean =>
  node.type === "MemberExpression" &&
  node.property.type === "Identifier" &&
  node.property.name === "Type" &&
  node.object.type === "MemberExpression" &&
  node.object.property.type === "Identifier" &&
  node.object.property.name === "Struct" &&
  node.object.object.type === "Identifier" &&
  node.object.object.name === "Schema";

/** Whether an interface extends `Schema.Struct.Type<typeof <name>Fields>`. */
const extendsItsFields = (
  node: ESTree.TSInterfaceDeclaration,
  name: string,
): boolean =>
  node.extends.some(({ expression, typeArguments }) => {
    const [fields] = typeArguments?.params ?? [];
    return (
      isStructType(expression) &&
      fields !== undefined &&
      fields.type === "TSTypeQuery" &&
      fields.exprName.type === "Identifier" &&
      fields.exprName.name === `${name}Fields`
    );
  });

/** A module's top-level statement, with an `export` taken off. */
const declared = (statement: ESTree.Node): ESTree.Node | undefined =>
  statement.type === "ExportNamedDeclaration"
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
const typeFromSchema: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "A type named after a schema is `typeof X.Type`, or, for a schema that refers to itself, an interface extending `Schema.Struct.Type<typeof XFields>`.",
    },
    messages: {
      drift:
        "Write `type {{name}} = typeof {{name}}.Type`, so the type and the schema can't drift apart. If {{name}} refers to itself, declare its other fields once as `{{name}}Fields`, spread them into the schema, and write `interface {{name}} extends Schema.Struct.Type<typeof {{name}}Fields>` with only the field that refers back.",
    },
  },
  create: (context) => ({
    Program: (program) => {
      const statements = program.body.flatMap((statement) => {
        const node = declared(statement);
        return node === undefined ? [] : [node];
      });
      const schemas = new Set(
        statements.flatMap((node) =>
          node.type === "VariableDeclaration"
            ? node.declarations.flatMap(({ id, init }) =>
                id.type === "Identifier" &&
                init !== null &&
                init !== undefined &&
                rootsAtSchema(init)
                  ? [id.name]
                  : [],
              )
            : [],
        ),
      );
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

/** What a module names: each imported binding with its source, and the types it declares. */
interface ModuleNames {
  readonly imports: ReadonlyMap<string, string>;
  readonly types: ReadonlySet<string>;
}

const moduleNames = (program: ESTree.Program): ModuleNames => ({
  imports: new Map(
    program.body.flatMap((statement) =>
      statement.type === "ImportDeclaration"
        ? statement.specifiers.map(({ local }): [string, string] => [
            local.name,
            statement.source.value,
          ])
        : [],
    ),
  ),
  types: new Set(
    program.body.flatMap((statement) => {
      const node = declared(statement);
      return node !== undefined &&
        (node.type === "TSTypeAliasDeclaration" ||
          node.type === "TSInterfaceDeclaration" ||
          node.type === "TSEnumDeclaration" ||
          node.type === "ClassDeclaration") &&
        node.id !== null
        ? [node.id.name]
        : [];
    }),
  ),
});

/** Effect's own constructors, such as `Ref.make`, make no domain value. */
const isEffect = (source: string): boolean =>
  source === "effect" ||
  source.startsWith("effect/") ||
  source.startsWith("@effect/");

/** The name a type or value is reached through: `Event` in `Event.cases.Requested`. */
const rootName = (
  node: ESTree.TSTypeName | ESTree.Expression,
): string | undefined => {
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
const typeNames = (type: ESTree.TSType): ReadonlyArray<string> => {
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
      return type.members.flatMap((member) =>
        member.type === "TSPropertySignature" && member.typeAnnotation !== null
          ? typeNames(member.typeAnnotation.typeAnnotation)
          : [],
      );
    default:
      return [];
  }
};

const annotationOf = (
  param: ESTree.ParamPattern,
): ESTree.TSType | undefined => {
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
const isData = (node: ESTree.ObjectExpression): boolean =>
  node.properties.every(
    (property) =>
      property.type === "SpreadElement" ||
      (!property.method &&
        property.value.type !== "ArrowFunctionExpression" &&
        property.value.type !== "FunctionExpression"),
  );

type Mapper = ESTree.ArrowFunctionExpression | ESTree.Function;

const topLevelName = (fn: Mapper): ESTree.BindingIdentifier | undefined => {
  const atTop = (node: ESTree.Node | null): boolean =>
    node?.type === "Program" ||
    ((node?.type === "ExportNamedDeclaration" ||
      node?.type === "ExportDefaultDeclaration") &&
      node.parent.type === "Program");
  if (fn.type === "FunctionDeclaration") {
    return atTop(fn.parent) ? (fn.id ?? undefined) : undefined;
  }
  const { parent } = fn;
  return parent.type === "VariableDeclarator" &&
    parent.init === fn &&
    parent.id.type === "Identifier" &&
    atTop(parent.parent.parent)
    ? parent.id
    : undefined;
};

const returnsFrom = (node: ESTree.Node): Mapper | undefined => {
  const { parent } = node;
  if (parent === null) {
    return undefined;
  }
  if (
    parent.type === "ArrowFunctionExpression" ||
    parent.type === "FunctionExpression" ||
    parent.type === "FunctionDeclaration"
  ) {
    return parent;
  }
  return returnsFrom(parent);
};

/**
 * A function that maps one type into another lives with one of them, as part
 * of that type's companion module, so a type's constructors are found where the
 * type is. The rule reads syntax, so a mapper is a top-level function that
 * takes a parameter of an imported type and returns a value of another
 * imported type: a `.make(...)` on an imported binding, or an object literal
 * of data whose return type is imported. It lives with neither type when no
 * parameter's type is declared in its module. Construction inside a handler is
 * not a mapper, Effect's own constructors make no domain value, an object with
 * functions in it is an implementation, and a function that takes `unknown`
 * parses what a boundary hands over, so it lives at that boundary.
 */
const mapperWithItsType: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "A function that maps one type into another lives in the module of one of them, as part of that type's companion.",
    },
    messages: {
      mapper:
        "{{name}} maps one type into another but lives with neither. Move it next to its source type or its target type, as part of that type's companion module, the way a schema's constructors live with the schema.",
    },
  },
  create: (context) => {
    const { imports, types } = moduleNames(context.sourceCode.ast);
    const domain = (name: string | undefined): name is string => {
      const source = name === undefined ? undefined : imports.get(name);
      return source !== undefined && !isEffect(source);
    };
    const built = (
      fn: Mapper,
      value: ESTree.Expression,
    ): string | undefined => {
      if (value.type === "ParenthesizedExpression") {
        return built(fn, value.expression);
      }
      if (
        value.type === "CallExpression" &&
        value.callee.type === "MemberExpression" &&
        !value.callee.computed &&
        value.callee.property.type === "Identifier" &&
        value.callee.property.name === "make"
      ) {
        const name = rootName(value.callee.object);
        return domain(name) ? name : undefined;
      }
      const returned = fn.returnType?.typeAnnotation;
      if (
        value.type === "ObjectExpression" &&
        isData(value) &&
        returned?.type === "TSTypeReference"
      ) {
        const name = rootName(returned.typeName);
        return domain(name) ? name : undefined;
      }
      return undefined;
    };
    const reported = new Set<Mapper>();
    const check = (fn: Mapper, value: ESTree.Expression) => {
      const name = topLevelName(fn);
      const target = built(fn, value);
      const annotations = fn.params.flatMap((param) => {
        const annotation = annotationOf(param);
        return annotation === undefined ? [] : [annotation];
      });
      const sources = annotations.flatMap(typeNames);
      if (
        name === undefined ||
        target === undefined ||
        reported.has(fn) ||
        !sources.some((source) => imports.has(source)) ||
        annotations.some(({ type }) => type === "TSUnknownKeyword") ||
        sources.some((source) => types.has(source)) ||
        sources.includes(target)
      ) {
        return;
      }
      reported.add(fn);
      context.report({
        messageId: "mapper",
        node: name,
        data: { name: name.name },
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

/** The shared lint setup's own rules, as `stack/<rule>`. */
const plugin: Plugin = {
  meta: { name: "stack" },
  rules: {
    "mapper-with-its-type": mapperWithItsType,
    "no-disable-comments": noDisableComments,
    "no-infinite-loops": noInfiniteLoops,
    "no-tagged-literal": noTaggedLiteral,
    "prefer-option": preferOption,
    "prefer-tagged-union": preferTaggedUnion,
    "type-from-schema": typeFromSchema,
  },
};

export default plugin;
