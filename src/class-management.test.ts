import { describe, expect, it } from "vitest";
import { withoutClass } from "./class-management";
import { makeEmptyClass } from "./seating";

describe("deleting a managed class", () => {
  const first = makeEmptyClass("一班");
  const second = makeEmptyClass("二班");
  const project = { classes: [first, second], activeClassId: first.id };

  it("switches to a remaining class when the active class is deleted", () => {
    expect(withoutClass(project, first.id)).toEqual({ classes: [second], activeClassId: second.id });
    expect(project.classes).toHaveLength(2);
  });

  it("keeps the active class when another class is deleted", () => {
    expect(withoutClass(project, second.id)).toEqual({ classes: [first], activeClassId: first.id });
  });

  it("returns an empty project after deleting the last class", () => {
    expect(withoutClass({ classes: [first], activeClassId: first.id }, first.id)).toEqual({ classes: [], activeClassId: "" });
  });
});
