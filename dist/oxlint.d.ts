import type { OxlintConfig } from "oxlint";
/**
 * The lint setup shared by every Foldkit, Effect and Alchemy Domain project.
 * It starts from what the stack's authors run: Effect's recommended rules,
 * Alchemy's choices beside them, and Foldkit's recommended rules in Foldkit
 * apps. On top of that, a few rules of our own, each kept because it makes the
 * code clearer. A project's oxlint.config.ts adds only its own paths. See
 * README.md.
 */
type Rules = NonNullable<OxlintConfig["rules"]>;
type Override = NonNullable<OxlintConfig["overrides"]>[number];
/**
 * Every rule Effect recommends, as an error, and every rule of its style
 * preset. Strict comes last so its errors win; the style rules it leaves out
 * stay warnings, which fail lint all the same.
 */
export declare const effectPresets: NonNullable<OxlintConfig["extends"]>;
export declare const plugins: NonNullable<OxlintConfig["plugins"]>;
export declare const jsPlugins: NonNullable<OxlintConfig["jsPlugins"]>;
export declare const categories: NonNullable<OxlintConfig["categories"]>;
export declare const rules: Rules;
/** Foldkit's recommended rules and its own overrides, in the given Foldkit app folders. */
export declare const foldkitOverrides: (apps: ReadonlyArray<string>) => Array<Override>;
export {};
