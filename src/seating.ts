import {
  Assignment,
  ClassData,
  Gender,
  GenderPreference,
  Goal,
  Issue,
  Layout,
  Proposal,
  Rule,
  Seat,
  Student,
  id,
} from "./model";

export function rowPattern(layout: Layout, row: number): number[] {
  return layout.rowPatterns?.[row] ?? Array(layout.desks).fill(2);
}
export function seatsOf(c: ClassData): Seat[] {
  const seats: Seat[] = [];
  for (let row = 0; row < c.layout.rows; row++)
    for (let desk = 0; desk < rowPattern(c.layout, row).length; desk++)
      for (let side = 0; side < rowPattern(c.layout, row)[desk]; side++) {
        const seat = {
          id: `r${row}-d${desk}-s${side}`,
          row,
          desk,
          side,
          col: desk * 2 + side,
          capacity: rowPattern(c.layout, row)[desk],
        };
        if (!c.layout.disabled.includes(seat.id)) seats.push(seat);
      }
  return seats;
}
export const seatLabel = (seat?: Seat) =>
  seat
    ? `第 ${seat.row + 1} 排 · 第 ${seat.desk + 1} 组${seat.capacity === 1 ? "单人座" : `${seat.side ? "右" : "左"}座`}`
    : "未安排";
export const studentName = (c: ClassData, studentId?: string) =>
  !studentId
    ? "暂无"
    : (c.students.find((s) => s.id === studentId)?.name ?? "未知学生");
export const studentSeat = (a: Assignment, studentId: string) =>
  Object.keys(a).find((k) => a[k] === studentId);
export type MoveResult =
  | { ok: true; assignments: Assignment; otherId?: string; wasUnseated: boolean }
  | { ok: false; reason: "unknown-student" | "invalid-seat" | "same-seat" | "occupied" | "locked" };
export function moveStudentToSeat(c: ClassData, studentId: string, targetSeat: string): MoveResult {
  if (!c.students.some((student) => student.id === studentId)) return { ok: false, reason: "unknown-student" };
  const valid = new Set(seatsOf(c).map((seat) => seat.id));
  if (!valid.has(targetSeat)) return { ok: false, reason: "invalid-seat" };
  const from = studentSeat(c.assignments, studentId);
  if (from === targetSeat) return { ok: false, reason: "same-seat" };
  const wasUnseated = !from || !valid.has(from);
  const otherId = c.assignments[targetSeat];
  if (c.locks.includes(studentId) || (otherId && c.locks.includes(otherId))) return { ok: false, reason: "locked" };
  if (wasUnseated && otherId) return { ok: false, reason: "occupied" };
  const assignments = { ...c.assignments };
  if (from) delete assignments[from];
  assignments[targetSeat] = studentId;
  if (otherId && from) assignments[from] = otherId;
  return { ok: true, assignments, otherId, wasUnseated };
}
export const activeRules = (c: ClassData) =>
  c.rules.filter(
    (r) =>
      (r.scope !== "until" ||
        !r.until ||
        r.until >= new Date().toISOString().slice(0, 10)) &&
      (r.scope !== "round" ||
        r.appliesToRound === undefined ||
        r.appliesToRound === (c.published ? c.round + 1 : c.round)),
  );
export const needText: Record<string, string> = {
  front: "前三排",
  back: "后两排",
  middle: "中间位置",
  edge: "靠边位置",
  window: "靠窗位置",
  door: "靠门位置",
};
export const relationText: Record<string, string> = {
  notDesk: "不同桌",
  notAdjacent: "不相邻",
  distance2: "保持至少两个座位距离",
  differentGroup: "不同小组",
  sameDesk: "同桌",
  sameGroup: "同小组",
};
export function ruleText(c: ClassData, r: Rule) {
  const name = studentName(c, r.studentId);
  if (r.type === "need")
    return `${name} · ${needText[r.need ?? ""] ?? "座位需求"}`;
  return `${name}与${studentName(c, r.targetId)} · ${relationText[r.relation ?? ""] ?? "学生关系"}`;
}
function needOkay(c: ClassData, r: Rule, s: Seat) {
  switch (r.need) {
    case "front":
      return s.row < Math.min(3, c.layout.rows);
    case "back":
      return s.row >= Math.max(0, c.layout.rows - 2);
    case "middle":
      return rowPattern(c.layout, s.row).length <= 2 || (s.desk > 0 && s.desk < rowPattern(c.layout, s.row).length - 1);
    case "edge":
      return s.desk === 0 || s.desk === rowPattern(c.layout, s.row).length - 1;
    case "window":
      return c.layout.windowSide === "left"
        ? s.desk === 0
        : s.desk === rowPattern(c.layout, s.row).length - 1;
    case "door":
      return c.layout.doorSide === "left"
        ? s.desk === 0
        : s.desk === rowPattern(c.layout, s.row).length - 1;
    default:
      return true;
  }
}
function relationOkay(r: Rule, a: Seat, b: Seat) {
  switch (r.relation) {
    case "notDesk":
      return !(a.row === b.row && a.desk === b.desk);
    case "notAdjacent":
      return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) > 1;
    case "distance2":
      return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) > 2;
    case "differentGroup":
      return a.desk !== b.desk;
    case "sameDesk":
      return a.row === b.row && a.desk === b.desk;
    case "sameGroup":
      return a.desk === b.desk;
    default:
      return true;
  }
}
export function inspect(
  c: ClassData,
  assignments: Assignment = c.assignments,
  includeIgnored = false,
): Issue[] {
  const issues: Issue[] = [];
  const ignored = new Set(c.ignoredRuleIds);
  if (
    assignments === c.assignments &&
    c.published &&
    changedCount(c.published, c.assignments) === 0 &&
    JSON.stringify(c.layout) ===
      JSON.stringify(c.publishedLayout ?? c.layout) &&
    JSON.stringify(c.students.map((s) => [s.id, s.name, s.gender, s.glasses])) ===
      JSON.stringify(
        (c.publishedStudents ?? c.students).map((s) => [s.id, s.name, s.gender, s.glasses]),
      )
  ) {
    for (const ruleId of c.publishedIgnoredRuleIds ?? []) ignored.add(ruleId);
  }
  const seats = seatsOf(c);
  const valid = new Map(seats.map((s) => [s.id, s]));
  const byStudent = new Map<string, Seat>();
  const seen = new Set<string>();
  for (const [seatId, studentId] of Object.entries(assignments)) {
    if (!valid.has(seatId)) {
      issues.push({
        id: `invalid-${seatId}`,
        studentIds: [studentId],
        message: `${studentName(c, studentId)}的位置已不在当前教室中`,
        severity: "must",
      });
      continue;
    }
    if (seen.has(studentId))
      issues.push({
        id: `duplicate-${studentId}`,
        studentIds: [studentId],
        message: `${studentName(c, studentId)}被安排了两个座位`,
        severity: "must",
      });
    seen.add(studentId);
    byStudent.set(studentId, valid.get(seatId)!);
  }
  for (const student of c.students)
    if (!seen.has(student.id))
      issues.push({
        id: `unseated-${student.id}`,
        studentIds: [student.id],
        message: `${student.name}还没有座位`,
        severity: "must",
      });
  for (const r of activeRules(c)) {
    if (!includeIgnored && ignored.has(r.id)) continue;
    const a = byStudent.get(r.studentId),
      b = r.targetId ? byStudent.get(r.targetId) : undefined;
    if (!a || (r.type === "relation" && !b)) continue;
    const okay = r.type === "need" ? needOkay(c, r, a) : relationOkay(r, a, b!);
    if (!okay)
      issues.push({
        id: `rule-${r.id}`,
        ruleId: r.id,
        studentIds: [r.studentId, ...(r.targetId ? [r.targetId] : [])],
        message: `${ruleText(c, r)}暂未满足`,
        severity: r.priority,
      });
  }
  return issues;
}
export function changedCount(before: Assignment, after: Assignment) {
  const ids = new Set([...Object.values(before), ...Object.values(after)]);
  return [...ids].filter(
    (s) => studentSeat(before, s) !== studentSeat(after, s),
  ).length;
}
export function partnerOf(c: ClassData, a: Assignment, studentId: string) {
  const seatId = studentSeat(a, studentId);
  if (!seatId) return undefined;
  const seat = seatsOf(c).find((s) => s.id === seatId);
  if (!seat) return undefined;
  return a[`r${seat.row}-d${seat.desk}-s${seat.side ? 0 : 1}`];
}
export function explain(
  c: ClassData,
  studentId: string,
  a: Assignment = c.assignments,
) {
  const seat = seatsOf(c).find((s) => s.id === studentSeat(a, studentId));
  if (!seat) return { must: [], prefer: [], context: ["尚未安排座位"] };
  const must: string[] = [],
    prefer: string[] = [],
    context: string[] = [];
  for (const rule of activeRules(c).filter(
    (r) => r.studentId === studentId || r.targetId === studentId,
  )) {
    const problem = inspect(c, a, true).some((i) => i.ruleId === rule.id);
    const line = `${problem ? "○" : "✓"} ${ruleText(c, rule)}${problem ? "（未满足）" : ""}`;
    (rule.priority === "must" ? must : prefer).push(line);
  }
  const prior = c.versions.at(-1)?.assignments;
  const old =
    prior && seatsOf(c).find((s) => s.id === studentSeat(prior, studentId));
  if (old)
    context.push(
      old.id === seat.id
        ? "与上一轮座位相同"
        : `上一轮在第 ${old.row + 1} 排，本轮在第 ${seat.row + 1} 排`,
    );
  const partner = partnerOf(c, a, studentId);
  if (partner) {
    const before = c.versions.filter(
      (v) => partnerOf(c, v.assignments, studentId) === partner,
    ).length;
    context.push(
      `${studentName(c, partner)}是同桌${before ? `，过去同桌过 ${before} 轮` : "，过去未同桌过"}`,
    );
  }
  if (c.locks.includes(studentId))
    context.push("你已锁定这个位置，自动排座会保留它");
  if (!must.length && !prefer.length) context.unshift("没有单独设置座位要求");
  return { must, prefer, context };
}
export function fairness(c: ClassData, a: Assignment = c.assignments): Issue[] {
  const issues: Issue[] = [];
  if (c.versions.length < 2) return issues;
  const recent = c.versions.slice(-3).map((v) => v.assignments);
  if (!c.versions.length || changedCount(c.versions.at(-1)!.assignments, a) > 0)
    recent.push(a);
  for (const student of c.students) {
    const seatHistory = recent
      .map((m) => seatsOf(c).find((s) => s.id === studentSeat(m, student.id)))
      .filter((s): s is Seat => !!s);
    if (
      seatHistory.length >= 3 &&
      seatHistory.slice(-3).every((s) => s.row >= c.layout.rows - 2)
    )
      issues.push({
        id: `rear-${student.id}`,
        studentIds: [student.id],
        message: `${student.name}连续 3 轮位于后两排`,
        severity: "info",
      });
    if (
      seatHistory.length >= 3 &&
      seatHistory
        .slice(-3)
        .every((s) => s.desk === 0 || s.desk === rowPattern(c.layout, s.row).length - 1)
    )
      issues.push({
        id: `edge-${student.id}`,
        studentIds: [student.id],
        message: `${student.name}连续 3 轮位于两侧`,
        severity: "info",
      });
    const partners = recent.map((m) => partnerOf(c, m, student.id));
    if (
      partners.length >= 3 &&
      partners.at(-1) &&
      partners.slice(-3).every((p) => p === partners.at(-1))
    )
      issues.push({
        id: `partner-${student.id}`,
        studentIds: [student.id],
        message: `${student.name}连续 3 轮与同一位同桌`,
        severity: "info",
      });
  }
  return issues;
}
function seedRandom(seed: number) {
  let x = seed | 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
function hashSeed(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++)
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash | 0;
}
function normalize(c: ClassData, a: Assignment) {
  const seats = seatsOf(c),
    studentIds = new Set(c.students.map((s) => s.id));
  const result: Assignment = {},
    placed = new Set<string>();
  for (const seat of seats) {
    const sid = a[seat.id];
    if (sid && studentIds.has(sid) && !placed.has(sid)) {
      result[seat.id] = sid;
      placed.add(sid);
    }
  }
  const empty = seats.filter((s) => !result[s.id]);
  c.students
    .filter((s) => !placed.has(s.id))
    .forEach((s, i) => {
      if (empty[i]) result[empty[i].id] = s.id;
    });
  return result;
}
function createScorer(c: ClassData, base: Assignment, genderPreference: GenderPreference) {
  const seatMap = new Map(seatsOf(c).map((s) => [s.id, s]));
  const genders = new Map(c.students.map((student) => [student.id, student.gender]));
  const basePositions = new Map(
    Object.entries(base).map(([seatId, sid]) => [sid, seatId]),
  );
  const history = new Map<
    string,
    { avgRow: number; lastRear: boolean; partners: Map<string, number> }
  >();
  for (const student of c.students) {
    const places = c.versions
      .slice(-3)
      .map((v) => seatMap.get(studentSeat(v.assignments, student.id) ?? ""))
      .filter((s): s is Seat => !!s);
    const partners = new Map<string, number>();
    for (const version of c.versions.slice(-4)) {
      const partner = partnerOf(c, version.assignments, student.id);
      if (partner) partners.set(partner, (partners.get(partner) ?? 0) + 1);
    }
    history.set(student.id, {
      avgRow: places.length
        ? places.reduce((n, s) => n + s.row, 0) / places.length
        : -1,
      lastRear: !!places.length && places.at(-1)!.row >= c.layout.rows - 2,
      partners,
    });
  }
  const rules = activeRules(c).filter((r) => !c.ignoredRuleIds.includes(r.id));
  return (a: Assignment, goal: Goal) => {
    const positions = new Map<string, Seat>();
    for (const [seatId, sid] of Object.entries(a)) {
      const seat = seatMap.get(seatId);
      if (seat) positions.set(sid, seat);
    }
    let value = (c.students.length - positions.size) * 10000;
    for (const rule of rules) {
      const seat = positions.get(rule.studentId);
      const target = rule.targetId ? positions.get(rule.targetId) : undefined;
      if (!seat || (rule.type === "relation" && !target)) continue;
      const okay =
        rule.type === "need"
          ? needOkay(c, rule, seat)
          : relationOkay(rule, seat, target!);
      if (!okay)
        value +=
          rule.priority === "must"
            ? 10000
            : goal === "order" || goal === "support"
              ? 120
              : 75;
    }
    for (const student of c.students) {
      const seat = positions.get(student.id);
      if (!seat) continue;
      if (basePositions.get(student.id) !== seat.id)
        value += goal === "steady" ? 20 : goal === "fresh" ? 0.25 : 1.1;
      const h = history.get(student.id)!;
      if ((goal === "rotate" || goal === "fresh") && h.avgRow >= 0) {
        value +=
          (c.layout.rows - 1 - Math.abs(seat.row - h.avgRow)) *
          (goal === "rotate" ? 2 : 0.6);
        if (h.lastRear && seat.row >= c.layout.rows - 2) value += 18;
      }
      const partner = a[`r${seat.row}-d${seat.desk}-s${seat.side ? 0 : 1}`];
      if (partner) {
        value +=
          (h.partners.get(partner) ?? 0) *
          (goal === "partner"
            ? 18
            : goal === "fresh"
              ? 9
              : goal === "steady"
                ? 0.5
                : 2);
        if (genderPreference !== "any" && seat.side === 0) {
          const first = genders.get(student.id), second = genders.get(partner);
          if (first && second && (genderPreference === "same" ? first !== second : first === second))
            value += 80;
        }
      }
    }
    return value;
  };
}
export function generate(c: ClassData, goal: Goal = "fresh", genderPreference: GenderPreference = "any"): Proposal[] {
  const variants: { goal: Goal; label: string; description: string }[] =
    goal === "steady"
      ? [
          {
            goal: "steady",
            label: "少动版",
            description: "尽量保留现在的位置",
          },
          {
            goal: "rotate",
            label: "公平轮换版",
            description: "让前后排更均衡",
          },
          {
            goal: "partner",
            label: "新同桌版",
            description: "优先尝试近期没坐过的同桌",
          },
        ]
      : [
          {
            goal,
            label:
              goal === "rotate"
                ? "公平轮换版"
                : goal === "partner"
                  ? "新同桌版"
                  : goal === "order"
                    ? "优先照顾规则版"
                    : goal === "support"
                      ? "互助关系版"
                      : "重新安排版",
            description: "优先解决你本次选择的目标",
          },
          {
            goal: "steady",
            label: "少动版",
            description: "尽量保留现在的位置",
          },
          {
            goal: goal === "partner" ? "rotate" : "partner",
            label: goal === "partner" ? "公平轮换版" : "新同桌版",
            description: "换一个方向做比较",
          },
        ];
  const seatIds = seatsOf(c).map((s) => s.id);
  const protectedStudents = new Set([...c.locks, ...c.protectedIds]);
  const original = normalize(c, c.assignments);
  const movable = seatIds.filter(
    (seatId) => !protectedStudents.has(original[seatId]),
  );
  const score = createScorer(c, original, genderPreference);
  let repaired = { ...original };
  for (let pass = 0; pass < Math.min(10, c.students.length); pass++) {
    const currentHard = inspect(c, repaired).filter(
      (i) => i.severity === "must",
    ).length;
    if (!currentHard) break;
    let best: Assignment | undefined;
    let bestTuple = [
      currentHard,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ];
    for (let i = 0; i < movable.length; i++)
      for (let j = i + 1; j < movable.length; j++) {
        const candidate = { ...repaired };
        [candidate[movable[i]], candidate[movable[j]]] = [
          candidate[movable[j]],
          candidate[movable[i]],
        ];
        if (!candidate[movable[i]]) delete candidate[movable[i]];
        if (!candidate[movable[j]]) delete candidate[movable[j]];
        const issues = inspect(c, candidate);
        const hard = issues.filter((issue) => issue.severity === "must").length;
        const tuple = [hard, changedCount(original, candidate), issues.length];
        if (
          hard < currentHard &&
          (tuple[0] < bestTuple[0] ||
            (tuple[0] === bestTuple[0] &&
              (tuple[1] < bestTuple[1] ||
                (tuple[1] === bestTuple[1] && tuple[2] < bestTuple[2]))))
        ) {
          best = candidate;
          bestTuple = tuple;
        }
      }
    if (!best) break;
    repaired = best;
  }
  return variants.map((variant, vi) => {
    const seed = hashSeed(
      seatIds.map((seatId) => original[seatId] ?? "").join("|") +
        variant.goal + genderPreference + c.students.map((student) => `${student.id}:${student.gender ?? ""}`).join("|") +
        activeRules(c)
          .map(
            (r) =>
              `${r.type}:${r.studentId}:${r.targetId}:${r.need}:${r.relation}:${r.priority}`,
          )
          .join("|"),
    );
    const random = seedRandom(seed + vi * 92821);
    let current = { ...repaired },
      currentScore = score(current, variant.goal);
    let best = { ...current },
      bestScore = currentScore;
    const iterations = Math.min(3400, Math.max(1200, movable.length * 65));
    for (let step = 0; step < iterations && movable.length > 1; step++) {
      const ai = Math.floor(random() * movable.length),
        bi = Math.floor(random() * movable.length);
      if (ai === bi) continue;
      const a = movable[ai],
        b = movable[bi];
      [current[a], current[b]] = [current[b], current[a]];
      if (!current[a]) delete current[a];
      if (!current[b]) delete current[b];
      const next = score(current, variant.goal);
      const temperature = 4 * (1 - step / iterations) + 0.2;
      if (
        next <= currentScore ||
        random() < Math.exp((currentScore - next) / temperature)
      ) {
        currentScore = next;
        if (next < bestScore) {
          bestScore = next;
          best = { ...current };
        }
      } else {
        [current[a], current[b]] = [current[b], current[a]];
        if (!current[a]) delete current[a];
        if (!current[b]) delete current[b];
      }
      if (step % 500 === 499) {
        current = { ...best };
        currentScore = bestScore;
      }
    }
    const newPartners = c.students.filter((s) => {
      const p = partnerOf(c, best, s.id);
      return (
        p &&
        !c.versions
          .slice(-3)
          .some((v) => partnerOf(c, v.assignments, s.id) === p)
      );
    }).length;
    return {
      id: id(),
      label: variant.label,
      description: variant.description,
      assignments: best,
      changed: changedCount(original, best),
      issues: inspect(c, best),
      newPartners,
      kind: "optimized" as const,
      method: `保留锁定位置，先减少必要规则冲突，再比较多次交换结果${genderPreference === "any" ? "" : `；尽量安排${genderPreference === "same" ? "同性" : "异性"}同桌（仅对已标注性别的学生）`}；相同输入会得到相同结果。`,
    };
  });
}
/** A transparent column-wise cyclic rotation. Locked and manually protected pupils stay put. */
export function generatePatternProposals(c: ClassData): Proposal[] {
  const original = normalize(c, c.assignments);
  const protectedIds = new Set([...c.locks, ...c.protectedIds]);
  const columns = new Map<number, Seat[]>();
  for (const seat of seatsOf(c)) {
    const list = columns.get(seat.col) ?? [];
    list.push(seat);
    columns.set(seat.col, list);
  }
  return [
    { label: "整列前移一排", steps: () => 1, description: "每列依次向黑板方向前移一排，到顶后回到该列末尾" },
    { label: "奇偶列分步轮换", steps: (col: number) => col % 2 === 0 ? 1 : 2, description: "从左往右数，奇数列前移一排，偶数列前移两排；到顶后循环" },
  ].map((pattern) => {
    const rotated: Assignment = { ...original };
    for (const [col, seats] of columns) {
      const movable = seats.filter((seat) => !protectedIds.has(original[seat.id]));
      if (movable.length < 2) continue;
      const values = movable.map((seat) => original[seat.id]);
      movable.forEach((seat, index) => {
        const studentId = values[(index + pattern.steps(col)) % movable.length];
        if (studentId) rotated[seat.id] = studentId;
        else delete rotated[seat.id];
      });
    }
    let assignments = { ...rotated };
    const movable = seatsOf(c).map((seat) => seat.id).filter((seatId) => !protectedIds.has(rotated[seatId]));
    for (let pass = 0; pass < Math.min(12, c.students.length); pass++) {
      const hardBefore = inspect(c, assignments).filter((issue) => issue.severity === "must").length;
      if (!hardBefore) break;
      let choice: Assignment | undefined;
      let best = [hardBefore, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
      for (let i = 0; i < movable.length; i++) for (let j = i + 1; j < movable.length; j++) {
        const candidate = { ...assignments };
        [candidate[movable[i]], candidate[movable[j]]] = [candidate[movable[j]], candidate[movable[i]]];
        if (!candidate[movable[i]]) delete candidate[movable[i]];
        if (!candidate[movable[j]]) delete candidate[movable[j]];
        const issues = inspect(c, candidate);
        const tuple = [issues.filter((issue) => issue.severity === "must").length, changedCount(rotated, candidate), issues.filter((issue) => issue.severity === "prefer").length];
        if (tuple[0] >= hardBefore) continue;
        if (tuple[0] < best[0] || (tuple[0] === best[0] && (tuple[1] < best[1] || (tuple[1] === best[1] && tuple[2] < best[2])))) {
          choice = candidate;
          best = tuple;
        }
      }
      if (!choice) break;
      assignments = choice;
    }
    const corrections = changedCount(rotated, assignments);
    const newPartners = c.students.filter((s) => {
      const partner = partnerOf(c, assignments, s.id);
      return partner && !c.versions.slice(-3).some((v) => partnerOf(c, v.assignments, s.id) === partner);
    }).length;
    return {
      id: id(), label: pattern.label, description: pattern.description,
      assignments, changed: changedCount(original, assignments),
      issues: inspect(c, assignments), newPartners,
      kind: "pattern" as const,
      method: `缺位行顺延至本列下一可用座位，锁定或手工保护的学生留在原位；${corrections ? `为满足必要规则，另外微调 ${corrections} 人。` : "本方案没有额外微调。"}${inspect(c, assignments).some((issue) => issue.severity === "must") ? "仍有必要规则冲突，暂不能采用。" : "必要规则已满足。"}`,
    };
  });
}
export type Adjustment =
  "front" | "back" | "middle" | "edge" | "partner" | "apart";
export function localSuggestions(
  c: ClassData,
  studentId: string,
  wish: Adjustment,
  otherId?: string,
): Proposal[] {
  const initial = normalize(c, c.assignments),
    from = studentSeat(initial, studentId);
  if (!from) return [];
  const candidates: Proposal[] = [];
  const currentIssues = inspect(c, initial).filter(
    (i) => i.severity === "must",
  ).length;
  for (const target of seatsOf(c)) {
    if (
      target.id === from ||
      (initial[target.id] && c.locks.includes(initial[target.id])) ||
      c.locks.includes(studentId)
    )
      continue;
    const next = { ...initial };
    const displaced = next[target.id];
    next[target.id] = studentId;
    if (displaced) next[from] = displaced;
    else delete next[from];
    const student = seatsOf(c).find(
      (s) => s.id === studentSeat(next, studentId),
    )!;
    const other =
      otherId && seatsOf(c).find((s) => s.id === studentSeat(next, otherId));
    let wanted = false;
    switch (wish) {
      case "front":
        wanted = student.row < Math.min(3, c.layout.rows);
        break;
      case "back":
        wanted = student.row >= c.layout.rows - 2;
        break;
      case "middle":
        wanted =
          rowPattern(c.layout, student.row).length <= 2 ||
          (student.desk > 0 && student.desk < rowPattern(c.layout, student.row).length - 1);
        break;
      case "edge":
        wanted = student.desk === 0 || student.desk === rowPattern(c.layout, student.row).length - 1;
        break;
      case "partner":
        wanted =
          !!partnerOf(c, next, studentId) &&
          partnerOf(c, next, studentId) !== partnerOf(c, initial, studentId);
        break;
      case "apart":
        wanted =
          !!other &&
          !(student.row === other.row && student.desk === other.desk);
        break;
    }
    if (!wanted) continue;
    const issues = inspect(c, next);
    const must = issues.filter((i) => i.severity === "must").length;
    const changed = changedCount(initial, next);
    candidates.push({
      id: id(),
      label: displaced ? `与${studentName(c, displaced)}交换` : "移到空位",
      description: `影响 ${changed} 人 · ${seatLabel(target)}`,
      assignments: next,
      changed,
      issues,
      newPartners: 0,
    });
    if (must > currentIssues + 1) candidates.pop();
  }
  candidates.sort(
    (a, b) =>
      a.issues.filter((i) => i.severity === "must").length -
        b.issues.filter((i) => i.severity === "must").length ||
      a.changed - b.changed ||
      a.issues.length - b.issues.length,
  );
  const unique = new Set<string>();
  return candidates
    .filter((p) => {
      const name = p.label;
      if (unique.has(name)) return false;
      unique.add(name);
      return true;
    })
    .slice(0, 3);
}
export function makeEmptyClass(name: string): ClassData {
  return {
    id: id(),
    name,
    students: [],
    layout: {
      rows: 6,
      desks: 3,
      disabled: [],
      doorSide: "right",
      windowSide: "left",
    },
    assignments: {},
    rules: [],
    locks: [],
    protectedIds: [],
    ignoredRuleIds: [],
    versions: [],
    round: 1,
    groups: [],
    seatingMode: "individual",
  };
}
export function parseGender(value: string): Gender | undefined {
  const normalized = value.trim().toLowerCase();
  if (["男", "男生", "boy", "male", "m"].includes(normalized)) return "boy";
  if (["女", "女生", "girl", "female", "f"].includes(normalized)) return "girl";
  return undefined;
}
export function parseNames(text: string): Student[] {
  const lines = text
    .split(/\r?\n/)
    .flatMap((line) => {
      const fields = line.split(/[,，、;；\t]/).map((field) => field.trim()).filter(Boolean);
      return fields.length === 2 && parseGender(fields[1]) ? [`${fields[0]} ${fields[1]}`] : fields;
    })
    .map((s) => s.trim())
    .filter(Boolean);
  return lines
    .map((line, i) => {
      const pieces = line.split(/\s+/);
      const maybeNumber = pieces.length > 1 && /^\d+$/.test(pieces[0]);
      const gender = parseGender(pieces.at(-1) ?? "");
      return {
        id: id(),
        name: (maybeNumber ? pieces.slice(1) : pieces).slice(0, gender ? -1 : undefined).join(" "),
        number: maybeNumber ? pieces[0] : String(i + 1),
        ...(gender ? { gender } : {}),
      };
    })
    .filter(
      (s) => s.name && !["姓名", "名字", "name", "Name"].includes(s.name),
    );
}
