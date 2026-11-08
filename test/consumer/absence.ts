export type Watch = number | null;

export const since = (seen: boolean): Watch => (seen ? 1 : null);
