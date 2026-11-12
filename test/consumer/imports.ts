import { chunk } from "@app/utilities";
import { fieldOf } from "@app/domain";
import { holdingOf } from "./mapper.ts";
import { pipe } from "effect";

export const all = [chunk, fieldOf, holdingOf, pipe];
