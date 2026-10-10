import { describe, expect, it } from "vitest";
import { groupOutlinePath } from "./group-outline";

describe("小组轮廓", () => {
  it("沿折形座位转弯，不跨过右下角的其他学生", () => {
    const path = groupOutlinePath([
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 10, y: 0, w: 10, h: 10 },
      { x: 0, y: 10, w: 10, h: 10 },
    ], 0);

    expect(path).toContain("M10 10H20");
    expect(path).toContain("M10 10V20");
    expect(path).not.toContain("M20 10V20");
    expect(path).not.toContain("M10 20H20");
    expect(path).not.toContain("M10 0V10");
  });
});
