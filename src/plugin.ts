import type { Plugin, Rule } from "@oxlint/plugins";

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

/** The shared lint setup's own rules, as `stack/<rule>`. */
const plugin: Plugin = {
  meta: { name: "stack" },
  rules: {
    "no-disable-comments": noDisableComments,
    "no-infinite-loops": noInfiniteLoops,
  },
};

export default plugin;
