import { describe, expect, it } from "vitest";
import { createSample } from "./sample";
import { migrateProject } from "./storage";
import {
  activeRules,
  changedCount,
  fairness,
  generate,
  generatePatternProposals,
  inspect,
  localSuggestions,
  makeEmptyClass,
  moveStudentToSeat,
  parseNames,
  seatsOf,
  studentSeat,
} from "./seating";

function sample() {
  return createSample().classes[0];
}
describe("排座决策", () => {
  it("自动方案保留锁定位置，并解决可满足的必要规则", () => {
    const c = sample();
    const locked = c.locks[0],
      original = studentSeat(c.assignments, locked);
    const proposals = generate(c, "steady");
    expect(proposals).toHaveLength(3);
    for (const p of proposals) {
      expect(studentSeat(p.assignments, locked)).toBe(original);
      expect(
        inspect(c, p.assignments).filter((i) => i.severity === "must"),
      ).toHaveLength(0);
    }
  }, 20000);
  it("名单可显式填写性别，未填写时保持未知", () => {
    const students = parseNames("张三 男\n李四 女\n王五");
    expect(students.map((student) => [student.name, student.gender])).toEqual([
      ["张三", "boy"], ["李四", "girl"], ["王五", undefined],
    ]);
  });
  it("可选的同性同桌偏好影响方案，且不移动锁定学生", () => {
    const c = makeEmptyClass("性别偏好");
    c.layout.rows = 1;
    c.layout.desks = 2;
    c.students = [
      { id: "b1", name: "男甲", gender: "boy" },
      { id: "g1", name: "女甲", gender: "girl" },
      { id: "b2", name: "男乙", gender: "boy" },
      { id: "g2", name: "女乙", gender: "girl" },
    ];
    c.assignments = { "r0-d0-s0": "b1", "r0-d0-s1": "g1", "r0-d1-s0": "b2", "r0-d1-s1": "g2" };
    c.locks = ["b1"];
    const proposal = generate(c, "steady", "same")[0];
    expect(studentSeat(proposal.assignments, "b1")).toBe("r0-d0-s0");
    expect([proposal.assignments["r0-d0-s0"], proposal.assignments["r0-d0-s1"]]).toEqual(["b1", "b2"]);
    expect([proposal.assignments["r0-d1-s0"], proposal.assignments["r0-d1-s1"]].sort()).toEqual(["g1", "g2"]);
  });
  it("教室容量不足时明确列出未安排学生", () => {
    const c = makeEmptyClass("测试班");
    c.layout.rows = 1;
    c.layout.desks = 1;
    c.students = [
      { id: "a", name: "甲" },
      { id: "b", name: "乙" },
      { id: "c", name: "丙" },
    ];
    c.assignments = { "r0-d0-s0": "a", "r0-d0-s1": "b" };
    expect(seatsOf(c)).toHaveLength(2);
    expect(inspect(c).some((i) => i.id === "unseated-c")).toBe(true);
    expect(generate(c)[0].issues.some((i) => i.id === "unseated-c")).toBe(true);
  });
  it("局部调整优先交换两人，并保留其他锁定位置", () => {
    const c = sample();
    const old = studentSeat(c.assignments, "sample-33");
    const suggestions = localSuggestions(c, "sample-33", "apart", "sample-34");
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].changed).toBe(2);
    expect(studentSeat(suggestions[0].assignments, "sample-33")).not.toBe(old);
    expect(studentSeat(suggestions[0].assignments, "sample-12")).toBe(
      studentSeat(c.assignments, "sample-12"),
    );
  });
  it("未发布的新草稿不会把当前轮重复算进公平历史", () => {
    const c = sample();
    expect(fairness(c)).toHaveLength(0);
  });
  it("仅本轮规则在进入下一轮草稿后失效", () => {
    const c = sample();
    c.rules.push({
      id: "once",
      type: "need",
      studentId: "sample-1",
      need: "front",
      priority: "must",
      scope: "round",
      appliesToRound: 5,
    });
    expect(activeRules(c).some((r) => r.id === "once")).toBe(true);
    c.round = 5;
    expect(activeRules(c).some((r) => r.id === "once")).toBe(false);
  });
  it("本轮放宽只作用于已发布座位，新方案仍会检查原规则", () => {
    const c = sample();
    const conflict = c.rules.find(
      (r) => r.type === "relation" && r.priority === "must",
    )!;
    c.publishedIgnoredRuleIds = [conflict.id];
    expect(inspect(c).some((i) => i.ruleId === conflict.id)).toBe(false);
    const proposal = generate(c, "steady")[0];
    expect(
      inspect(c, proposal.assignments).some((i) => i.ruleId === conflict.id),
    ).toBe(false);
    expect(
      proposal.assignments["r5-d1-s0"] === "sample-33" &&
        proposal.assignments["r5-d1-s1"] === "sample-34",
    ).toBe(false);
  });
  it("少动目标只为新增必要要求调整少数学生", () => {
    const c = sample();
    c.rules.push({
      id: "new-front",
      type: "need",
      studentId: "sample-36",
      need: "front",
      priority: "must",
      scope: "always",
    });
    c.locks.push("sample-35");
    const proposal = generate(c, "steady").find((p) => p.label === "少动版")!;
    expect(proposal.issues.filter((i) => i.severity === "must")).toHaveLength(
      0,
    );
    expect(proposal.changed).toBeLessThanOrEqual(8);
  });
  it("变化人数按学生计算，不按座位格数计算", () => {
    const c = sample();
    const next = { ...c.assignments };
    [next["r0-d0-s0"], next["r0-d0-s1"]] = [next["r0-d0-s1"], next["r0-d0-s0"]];
    expect(changedCount(c.assignments, next)).toBe(2);
  });
  it("旧数据升级后仍保留已发布教室的完整排数", () => {
    const project = createSample();
    const c = project.classes[0];
    c.publishedLayout = undefined;
    c.publishedStudents = undefined;
    c.layout.rows = 5;
    const migrated = migrateProject(project).classes[0];
    expect(c.layout.rows).toBe(5);
    expect(migrated.publishedLayout?.rows).toBe(6);
    expect(migrated.publishedStudents).toHaveLength(36);
  });
  it("逐排混合单人和双人桌时，只生成真实存在的座位", () => {
    const c = makeEmptyClass("混合教室");
    c.layout.rows = 3;
    c.layout.desks = 2;
    c.layout.rowPatterns = [[1, 2], [2], [2, 1]];
    expect(seatsOf(c)).toHaveLength(8);
    expect(seatsOf(c).some((seat) => seat.id === "r0-d0-s1")).toBe(false);
    expect(seatsOf(c).some((seat) => seat.id === "r1-d1-s0")).toBe(false);
    c.students = [{ id: "a", name: "甲" }];
    c.assignments = { "r1-d0-s0": "a" };
    c.rules = [{ id: "window", type: "need", studentId: "a", need: "window", priority: "must", scope: "always" }];
    c.layout.windowSide = "right";
    expect(inspect(c).filter((issue) => issue.severity === "must")).toHaveLength(0);
  });
  it("规律轮换按列前移，固定学生不动且学生不会重复或丢失", () => {
    const c = makeEmptyClass("轮换班");
    c.layout.rows = 3;
    c.layout.desks = 1;
    c.layout.rowPatterns = [[1], [1], [1]];
    c.students = [{ id: "a", name: "甲" }, { id: "b", name: "乙" }, { id: "c", name: "丙" }];
    c.assignments = { "r0-d0-s0": "a", "r1-d0-s0": "b", "r2-d0-s0": "c" };
    const regular = generatePatternProposals(c)[0];
    expect(regular.assignments).toEqual({ "r0-d0-s0": "b", "r1-d0-s0": "c", "r2-d0-s0": "a" });
    c.locks = ["b"];
    const locked = generatePatternProposals(c)[0];
    expect(studentSeat(locked.assignments, "b")).toBe("r1-d0-s0");
    expect(new Set(Object.values(locked.assignments)).size).toBe(3);
  });
  it("规律轮换会微调冲突位置以满足可满足的必要规则", () => {
    const c = sample();
    const lockedPlace = studentSeat(c.assignments, c.locks[0]);
    for (const proposal of generatePatternProposals(c)) {
      expect(studentSeat(proposal.assignments, c.locks[0])).toBe(lockedPlace);
      expect(proposal.issues.filter((issue) => issue.severity === "must")).toHaveLength(0);
      expect(proposal.kind).toBe("pattern");
    }
  });
  it("待安排学生只能放进可用空位，并清除旧的无效座位记录", () => {
    const c = makeEmptyClass("手动安排");
    c.layout.rows = 1;
    c.layout.desks = 2;
    c.layout.rowPatterns = [[1, 1]];
    c.students = [{ id: "a", name: "甲" }, { id: "b", name: "乙" }];
    c.assignments = { "r0-d0-s0": "a", "r0-d9-s0": "b" };
    expect(moveStudentToSeat(c, "b", "r0-d0-s0")).toMatchObject({ ok: false, reason: "occupied" });
    c.layout.disabled = ["r0-d1-s0"];
    expect(moveStudentToSeat(c, "b", "r0-d1-s0")).toMatchObject({ ok: false, reason: "invalid-seat" });
    c.layout.disabled = [];
    const result = moveStudentToSeat(c, "b", "r0-d1-s0");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.assignments).toEqual({ "r0-d0-s0": "a", "r0-d1-s0": "b" });
  });
  it("读取旧数据时将停用座位上的学生转为待安排，同时保留发布历史", () => {
    const project = createSample();
    const c = project.classes[0];
    c.layout.disabled.push("r0-d0-s0");
    const migrated = migrateProject(project).classes[0];
    expect(migrated.assignments["r0-d0-s0"]).toBeUndefined();
    expect(migrated.published?.["r0-d0-s0"]).toBe("sample-1");
  });
});
