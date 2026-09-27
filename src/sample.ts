import { ClassData, ProjectData, id } from "./model";
const names = [
  "李子涵",
  "王梓轩",
  "陈雨欣",
  "刘浩然",
  "张诗涵",
  "赵一鸣",
  "周欣怡",
  "孙宇航",
  "黄思远",
  "林语嫣",
  "陈浩",
  "吴梓豪",
  "郑欣妍",
  "何俊杰",
  "高子涵",
  "刘思齐",
  "宋雨桐",
  "朱宇辰",
  "唐心怡",
  "陆天佑",
  "许佳宁",
  "郭睿",
  "杨欣然",
  "罗子轩",
  "沈梦琪",
  "周子豪",
  "韩文博",
  "梁诗雨",
  "吴昊",
  "程思涵",
  "欧阳俊",
  "邓雅文",
  "王晨",
  "李浩",
  "陈晨",
  "张浩",
];
const sampleGirls = new Set([1, 3, 5, 7, 10, 13, 15, 16, 17, 19, 21, 23, 25, 28, 30, 32, 35]);
export function createSample(): ProjectData {
  const students = names.map((name, i) => ({
    id: `sample-${i + 1}`,
    name,
    number: String(i + 1).padStart(2, "0"),
    gender: sampleGirls.has(i + 1) ? "girl" as const : "boy" as const,
    glasses: i % 9 === 0,
  }));
  const assignments: Record<string, string> = {};
  students.forEach((s, i) => {
    assignments[`r${Math.floor(i / 6)}-d${Math.floor((i % 6) / 2)}-s${i % 2}`] =
      s.id;
  });
  const now = new Date().toISOString();
  const c: ClassData = {
    id: id(),
    name: "七年级 3 班",
    students,
    layout: {
      rows: 6,
      desks: 3,
      disabled: [],
      doorSide: "right",
      windowSide: "left",
    },
    assignments,
    locks: ["sample-12"],
    protectedIds: [],
    ignoredRuleIds: [],
    round: 4,
    rules: [
      {
        id: id(),
        type: "need",
        studentId: "sample-1",
        need: "front",
        priority: "must",
        scope: "always",
      },
      {
        id: id(),
        type: "need",
        studentId: "sample-8",
        need: "front",
        priority: "prefer",
        scope: "always",
      },
      {
        id: id(),
        type: "relation",
        studentId: "sample-33",
        targetId: "sample-34",
        relation: "notDesk",
        priority: "must",
        scope: "always",
      },
      {
        id: id(),
        type: "relation",
        studentId: "sample-3",
        targetId: "sample-9",
        relation: "sameGroup",
        priority: "prefer",
        scope: "always",
      },
    ],
    versions: [
      {
        id: id(),
        round: 3,
        at: new Date(Date.now() - 14 * 86400000).toISOString(),
        effectiveDate: new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10),
        semesterWeek: 3,
        note: "按前后排轮换",
        assignments: Object.fromEntries(
          Object.entries(assignments).map(([seat], i) => [
            seat,
            students[(i + 6) % students.length].id,
          ]),
        ),
        label: "第 3 轮",
      },
      {
        id: id(),
        round: 4,
        at: now,
        effectiveDate: now.slice(0, 10),
        semesterWeek: 5,
        note: "本周起使用",
        assignments: { ...assignments },
        label: "第 4 轮 · 当前使用",
      },
    ],
    published: { ...assignments },
    publishedAt: now,
  };
  c.publishedLayout = structuredClone(c.layout);
  c.publishedStudents = structuredClone(c.students);
  c.versions.forEach((version) => {
    version.layout = structuredClone(c.layout);
    version.students = structuredClone(c.students);
  });
  return { classes: [c], activeClassId: c.id };
}
