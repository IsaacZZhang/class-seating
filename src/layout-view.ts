import { Layout } from "./model";

/** Display order for a half-turn of the classroom, without changing seat identities. */
export function viewIndices(count: number, position?: Layout["podiumPosition"]) {
  return Array.from({ length: count }, (_, index) => position === "bottom" ? count - 1 - index : index);
}
