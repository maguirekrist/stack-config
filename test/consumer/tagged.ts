export type Holding =
  | { readonly _tag: "Answered"; readonly value: string }
  | { readonly _tag: "Unanswered" };

export const unanswered: Holding = { _tag: "Unanswered" };
