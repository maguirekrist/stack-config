import type { Schema as EffectSchema } from "effect";
import type { Update } from "foldkit";
import type { Message } from "./Message.ts";
import type { Page } from "./Page.ts";

// The rule reads this module's text, so a stand-in for Effect's Schema is enough here.
const Schema = { Struct: (fields: object) => fields, String: "string" };

export const Model = Schema.Struct({ notice: Schema.String });
export type Model = typeof Model.Type;

export const Field = Schema.Struct({ label: Schema.String });
export type Field = typeof Field.Type;

export interface Row {
  readonly label: string;
}

export type UpdateReturn = Update.Return<Model, Message>;

export type Listing = Page.Listing<Model>;

export type Entry = EffectSchema.Schema.Type<typeof Field>;
