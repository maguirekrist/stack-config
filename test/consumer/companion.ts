import type { Book } from "./schema.ts";

export interface Shelf {
  readonly label: string;
}

export const Shelf = {
  of: (shelf: Shelf): Book => ({ title: shelf.label }),
};
