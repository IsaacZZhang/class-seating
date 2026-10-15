import { describe, expect, it } from "vitest";
import { createSample } from "./sample";
import { inspect, seatsOf } from "./seating";
import { migrateProject } from "./storage";
import { viewIndices } from "./layout-view";

describe("讲台观看方向", () => {
  it("旧班级默认从讲台看，反向显示时混合桌型的座位身份保持一致", () => {
    const pattern = [1, 3, 2];
    const order = (position?: "top" | "bottom") => viewIndices(2, position).flatMap((row) =>
      viewIndices(pattern.length, position).flatMap((desk) =>
        viewIndices(pattern[desk], position).map((side) => `r${row}-d${desk}-s${side}`)));
    expect(order()).toEqual(order("top"));
    expect(order("bottom")).toEqual([...order()].reverse());
    expect(pattern).toEqual([1, 3, 2]);
  });

  it("切换方向并恢复存储不会改变座位、学生安排或前后左右规则", () => {
    const project = createSample();
    const klass = project.classes[0];
    klass.layout.podiumSeats = ["left", "right"];
    const before = structuredClone(klass);
    klass.layout.podiumPosition = "bottom";
    const restored = migrateProject(JSON.parse(JSON.stringify(project))).classes[0];
    expect(restored.layout.podiumPosition).toBe("bottom");
    expect(seatsOf(restored)).toEqual(seatsOf(before));
    expect(restored.assignments).toEqual(before.assignments);
    expect(restored.rules).toEqual(before.rules);
    expect(inspect(restored, restored.assignments)).toEqual(inspect(before, before.assignments));
  });
});
