import type { UserId } from "@app/domain";
import type { Model, UpdateReturn } from "./Model.ts";

export const init = (recipient: UserId): UpdateReturn => ({
  model: { notice: recipient },
  commands: [],
});

export const refuse = (model: Model, reason: string): UpdateReturn => ({
  model: { ...model, notice: reason },
});
