import { describe, expect, it } from "vitest";
import { assignZoneByPoints, groupClusters, moveFormation, nextTurn, zoneError } from "./groups";
import { explain, generate, generatePatternProposals, inspect, localSuggestions, makeEmptyClass, moveStudentToSeat, seatLabel, seatsOf } from "./seating";
import { migrateProject } from "./storage";

function classroom() {
  const c = makeEmptyClass("特殊座位验证");
  c.layout = { ...c.layout, rows: 2, desks: 1, podiumSeats: ["left", "right"] };
  c.students = [{ id: "monitor", name: "值日", groupId: "g" }, { id: "a", name: "甲", groupId: "g" }, { id: "b", name: "乙", groupId: "g" }];
  c.assignments = { "podium-left": "monitor", "r0-d0-s0": "a", "r0-d0-s1": "b" };
  c.groups = [{ id: "g", name: "一组", color: "#2861db", zone: ["r0-d0-s0", "r0-d0-s1"] }];
  return c;
}

describe("讲台值日特殊座位", () => {
  it("keeps legacy layouts unchanged and adds one independent seat per enabled side", () => {
    const c = classroom();
    expect(seatsOf(c)).toHaveLength(6);
    expect(seatLabel(seatsOf(c)[0])).toBe("讲台左侧 · 值日");
    c.layout.podiumSeats = ["right"];
    expect(seatsOf(c)).toHaveLength(5);
    delete c.layout.podiumSeats;
    expect(seatsOf(c)).toHaveLength(4);
  });

  it("allows manual exchanges between duty and regular seats without duplicate students", () => {
    const c = classroom();
    const result = moveStudentToSeat(c, "a", "podium-left");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.assignments["podium-left"]).toBe("a");
    expect(result.assignments["r0-d0-s0"]).toBe("monitor");
    expect(inspect(c, result.assignments)).toEqual([]);
    c.locks = ["monitor"];
    expect(moveStudentToSeat(c, "a", "podium-left").ok).toBe(false);
  });

  it("preserves assigned monitors and reserves empty duty seats across all automatic proposals", () => {
    const c = classroom();
    for (const proposal of [...generate(c, "rotate"), ...generatePatternProposals(c)]) {
      expect(proposal.assignments["podium-left"]).toBe("monitor");
      expect(proposal.assignments["podium-right"]).toBeUndefined();
      expect(new Set(Object.values(proposal.assignments)).size).toBe(c.students.length);
      expect(proposal.issues.filter((issue) => issue.severity === "must")).toEqual([]);
    }
    expect(localSuggestions(c, "monitor", "back")).toEqual([]);
    expect(localSuggestions(c, "a", "front").every((proposal) => proposal.assignments["podium-left"] === "monitor" && !proposal.assignments["podium-right"])).toBe(true);
  });

  it("never automatically fills a duty seat even when regular seats run out", () => {
    const c = classroom();
    c.assignments = {};
    c.students.push({ id: "d", name: "丁" }, { id: "e", name: "戊" });
    for (const proposal of generate(c)) {
      expect(proposal.assignments["podium-left"]).toBeUndefined();
      expect(proposal.assignments["podium-right"]).toBeUndefined();
      expect(proposal.issues.some((issue) => issue.id.startsWith("unseated-"))).toBe(true);
    }
  });

  it("excludes monitors from group zones, assignment and group drags", () => {
    const c = classroom();
    expect(nextTurn(c).phase).toBe("done");
    expect(zoneError(c, "g", c.groups![0].zone)).toBe("");
    expect(zoneError(c, "g", ["podium-left", "r0-d0-s0"])).toContain("不参与");
    expect(assignZoneByPoints(c, "g")["podium-left"]).toBe("monitor");
    expect(groupClusters(seatsOf(c), c.assignments, c.students).flatMap((cluster) => cluster.studentIds)).not.toContain("monitor");
    expect(moveFormation(c, ["monitor", "a"], "a", "r1-d0-s0").ok).toBe(false);
  });

  it("preserves duty assignments and historical layouts through backup migration", () => {
    const c = classroom();
    c.versions = [{ id: "v", round: 1, at: "2026-10-14", label: "特殊座位", layout: structuredClone(c.layout), assignments: { ...c.assignments } }];
    const migrated = migrateProject({ classes: [c], activeClassId: c.id });
    expect(migrated.classes[0].assignments["podium-left"]).toBe("monitor");
    c.layout.podiumSeats = [];
    expect(inspect(c).some((issue) => issue.id === "invalid-podium-left")).toBe(true);
    expect(seatsOf({ ...c, layout: c.versions[0].layout! }).some((seat) => seat.id === "podium-left")).toBe(true);
  });

  it("describes duty seats accurately and treats them as front seats even in one-row classrooms", () => {
    const c = classroom();
    c.layout.rows = 1;
    c.rules = [
      { id: "front", type: "need", studentId: "monitor", need: "front", priority: "must", scope: "always" },
      { id: "back", type: "need", studentId: "monitor", need: "back", priority: "must", scope: "always" },
    ];
    expect(inspect(c).filter((issue) => issue.ruleId).map((issue) => issue.ruleId)).toEqual(["back"]);
    c.versions = [{ id: "v", round: 1, at: "2026-10-14", label: "上一轮", assignments: { "r0-d0-s0": "monitor" } }];
    expect(explain(c, "monitor").context.join(" ")).toContain("讲台左侧");
    expect(explain(c, "monitor").context.join(" ")).not.toContain("第 0 排");
  });
});
