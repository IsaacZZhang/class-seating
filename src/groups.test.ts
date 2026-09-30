import { describe, expect, it } from "vitest";
import { ClassData } from "./model";
import { makeEmptyClass, seatsOf } from "./seating";
import {
  assignZoneByPoints,
  groupPoints,
  groupsByPriority,
  moveFormation,
  nextTurn,
  seatsAreTogether,
  zoneError,
} from "./groups";

function room(): ClassData {
  const c = makeEmptyClass("一组");
  c.layout = { rows: 2, desks: 2, disabled: [], doorSide: "right", windowSide: "left" };
  c.groups = [
    { id: "g1", name: "甲组", color: "#d4532b", zone: [] },
    { id: "g2", name: "乙组", color: "#2f6f4e", zone: [] },
  ];
  c.students = [
    { id: "a", name: "安安", groupId: "g1", points: 3 },
    { id: "b", name: "贝贝", groupId: "g1", points: 8 },
    { id: "c", name: "晨晨", groupId: "g2", points: 1 },
    { id: "d", name: "冬冬", groupId: "g2", points: 1 },
  ];
  return c;
}

describe("分组选座", () => {
  it("按小组总分决定选区顺序，组内按个人积分决定选座顺序", () => {
    const c = room();
    expect(groupsByPriority(c).map((group) => group.name)).toEqual(["甲组", "乙组"]);
    expect(groupPoints(c.students, "g1")).toBe(11);
    const turn = nextTurn(c);
    expect(turn.phase).toBe("zone");
    if (turn.phase === "zone") expect(turn.group.id).toBe("g1");
    c.groups![0].zone = ["r0-d0-s0", "r0-d0-s1"];
    const seatTurn = nextTurn(c);
    expect(seatTurn.phase).toBe("seat");
    if (seatTurn.phase === "seat") expect(seatTurn.student.id).toBe("b");
  });

  it("只接受连在一起、且不重叠的区域", () => {
    const c = room();
    const seats = seatsOf(c);
    expect(seatsAreTogether(seats, ["r0-d0-s0", "r0-d0-s1"])).toBe(true);
    expect(seatsAreTogether(seats, ["r0-d0-s0", "r1-d1-s1"])).toBe(false);
    expect(zoneError(c, "g1", ["r0-d0-s0"])).toMatch(/正好选择 2/);
    expect(zoneError(c, "g1", ["r0-d0-s0", "r1-d1-s1"])).toMatch(/不连在一起/);
    c.groups![0].zone = ["r0-d0-s0", "r0-d0-s1"];
    expect(zoneError(c, "g2", ["r0-d0-s1", "r0-d1-s0"])).toMatch(/重叠/);
  });

  it("区域内积分高的同学坐到更靠前的座位", () => {
    const c = room();
    c.groups![0].zone = ["r1-d0-s0", "r0-d0-s1"];
    const assignments = assignZoneByPoints(c, "g1", {});
    expect(assignments["r0-d0-s1"]).toBe("b");
    expect(assignments["r1-d0-s0"]).toBe("a");
  });

  it("拖动时整组保持相对位置，不会占到组外同学的座位", () => {
    const c = room();
    c.assignments = { "r0-d0-s0": "a", "r0-d0-s1": "b", "r0-d1-s0": "c" };
    const moved = moveFormation(c, ["a", "b"], "a", "r1-d0-s0");
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect(moved.assignments["r1-d0-s0"]).toBe("a");
      expect(moved.assignments["r1-d0-s1"]).toBe("b");
      expect(moved.assignments["r0-d1-s0"]).toBe("c");
    }
    expect(moveFormation(c, ["a", "b"], "a", "r0-d1-s0").ok).toBe(false);
  });
});
