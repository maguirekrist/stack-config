import * as Holder from "./holder.ts";
import * as Option from "effect/Option";

export const first: Holder.Holder = Holder.emptyHolder;

export const book = Holder.of(first);

export const isOption = Option.isOption(book);
