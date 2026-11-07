# Coding standards for review

Lint enforces the mechanical rules (README.md). Review enforces these judgement calls, which no rule can check. Also read the project's own idiom docs for the area a change touches.

- **Fixes satisfy the idiom, not the rule.** A constant named for a literal, a parameter object or rest tuple built to get under a count, or a wrapper added only to quiet a rule: flag it, and ask for the idiomatic shape or a config exception with a reason.
- **Modules split by responsibility.** A module that does several jobs, such as a page that owns its routing, its forms and its views, is split into one module per job. A module is never split to meet a size.
- **Foldkit state modelling.** A boolean or stage literal beside fields that matter only in some states becomes a tagged union whose variants carry their own data. See Foldkit's AGENTS.md, "State Modeling".
- **Absence is `Option`.** A function that may have nothing to return returns `Option`, not `undefined`, `null` or an empty value. `null` stays only at wire, JSON and library boundaries.
- **One way of doing things.** A change that does something the project already has an idiom for uses that idiom. A new idiom is written down in the project's idiom docs in the same change.
