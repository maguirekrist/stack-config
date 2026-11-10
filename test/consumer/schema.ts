// The rule reads syntax, so a stand-in for Effect's Schema is enough here.
const Schema = { Struct: (fields: object) => fields, String: "string" };

export interface Book {
  readonly title: string;
}

export const Book = Schema.Struct({ title: Schema.String });
