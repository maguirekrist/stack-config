import type { Book } from "./schema.ts";

export interface Holder {
  readonly name: string;
}

export const emptyHolder: Holder = { name: "" };

export const of = (holder: Holder): Book => ({ title: holder.name });
