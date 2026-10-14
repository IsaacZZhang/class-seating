import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), from: vi.fn(), remove: vi.fn(), eq: vi.fn(), select: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({
  auth: { getUser: mocks.getUser }, from: mocks.from,
}) }));
import { deleteClass } from "./cloud";

describe("deleteClass", () => {
  let storage: Map<string, string>;
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.clearAllMocks();
    storage = new Map([["class-seating-active", "class-one"]]);
    vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, removeItem: (key: string) => storage.delete(key) });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "teacher-one" } }, error: null });
    const chain = { delete: mocks.remove, eq: mocks.eq, select: mocks.select };
    mocks.from.mockReturnValue(chain);
    mocks.remove.mockReturnValue(chain);
    mocks.eq.mockReturnValue(chain);
    mocks.select.mockResolvedValue({ data: [{ id: "class-one" }], error: null });
  });

  it("restricts deletion to the selected class and authenticated teacher", async () => {
    await deleteClass("class-one");
    expect(mocks.from).toHaveBeenCalledWith("classes");
    expect(mocks.eq.mock.calls).toEqual([["id", "class-one"], ["teacher_id", "teacher-one"]]);
    expect(storage.has("class-seating-active")).toBe(false);
  });

  it("preserves the active class when another class is deleted", async () => {
    await deleteClass("class-two");
    expect(storage.get("class-seating-active")).toBe("class-one");
  });

  it("does not delete anything without a validated user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(deleteClass("class-one")).rejects.toThrow("请先登录");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("reports denied or missing classes instead of claiming success", async () => {
    mocks.select.mockResolvedValue({ data: [], error: null });
    await expect(deleteClass("class-one")).rejects.toThrow("班级不存在或你没有删除权限");
    expect(storage.get("class-seating-active")).toBe("class-one");
  });

  it("retains the current selection after a database failure", async () => {
    mocks.select.mockResolvedValue({ data: null, error: { message: "connection failed" } });
    await expect(deleteClass("class-one")).rejects.toThrow("connection failed");
    expect(storage.get("class-seating-active")).toBe("class-one");
  });
});
