import type { Book } from "./schema.ts";
import type { Holding } from "./tagged.ts";

export const holdingOf = (book: Book): Holding => ({
  _tag: "Answered",
  value: book.title,
});
