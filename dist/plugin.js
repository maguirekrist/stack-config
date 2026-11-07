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
/** The shared lint setup's own rules, as `stack/<rule>`. */
const plugin = {
    meta: { name: "stack" },
    rules: { "no-disable-comments": noDisableComments },
};
export default plugin;
