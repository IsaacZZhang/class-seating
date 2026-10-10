import { afterEach, describe, expect, it, vi } from "vitest";
import { id } from "./model";
import { makeEmptyClass } from "./seating";
import { repairGroupIds } from "./sync-ids";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

afterEach(() => vi.unstubAllGlobals());

describe("云端 UUID", () => {
  it("在 randomUUID 不可用的访问地址上仍生成有效 UUID", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(0) });
    expect(id()).toMatch(uuid);
  });

  it("重试同步时修复旧的小组 ID 和学生引用", () => {
    const klass = makeEmptyClass("11班");
    klass.groups = [{ id: "1791636350079-ydhr45ib4nm", name: "第一组", color: "#d4532b", zone: [] }];
    klass.students = [{ id: id(), name: "甲", groupId: klass.groups[0].id }];
    const project = { classes: [klass], activeClassId: klass.id };
    const repaired = repairGroupIds(project);

    expect(repaired.classes[0].groups?.[0].id).toMatch(uuid);
    expect(repaired.classes[0].students[0].groupId).toBe(repaired.classes[0].groups?.[0].id);
    expect(project.classes[0].groups?.[0].id).toBe("1791636350079-ydhr45ib4nm");
  });
});
