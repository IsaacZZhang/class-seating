import { Assignment, ClassData, Seat, Student, StudyGroup, id } from "./model";
import { seatsOf, studentSeat } from "./seating";

export const groupColors = [
  "#d4532b",
  "#2f6f4e",
  "#2c5f8a",
  "#8a5a12",
  "#6b3fa0",
  "#0f6e6e",
  "#a33b55",
  "#3d6b2f",
];

export function groupPoints(students: Student[], groupId: string) {
  return students
    .filter((student) => student.groupId === groupId)
    .reduce((total, student) => total + (student.points ?? 0), 0);
}

export function membersByPoints(students: Student[], groupId: string) {
  return students
    .filter((student) => student.groupId === groupId)
    .sort(
      (a, b) =>
        (b.points ?? 0) - (a.points ?? 0) ||
        a.name.localeCompare(b.name, "zh"),
    );
}

export function groupsByPriority(c: ClassData) {
  return [...(c.groups ?? [])].sort(
    (a, b) =>
      groupPoints(c.students, b.id) - groupPoints(c.students, a.id) ||
      a.name.localeCompare(b.name, "zh"),
  );
}

function touches(a: Seat, b: Seat) {
  if (a.row === b.row && a.desk === b.desk) return true;
  if (a.row === b.row && Math.abs(a.desk - b.desk) === 1) return true;
  return a.desk === b.desk && Math.abs(a.row - b.row) === 1;
}

export function seatsAreTogether(seats: Seat[], seatIds: string[]) {
  const picked = seatIds
    .map((seatId) => seats.find((seat) => seat.id === seatId))
    .filter((seat): seat is Seat => !!seat);
  if (picked.length !== seatIds.length || picked.length === 0) return false;
  const unseen = new Set(picked.map((seat) => seat.id));
  const queue = [picked[0]];
  unseen.delete(picked[0].id);
  while (queue.length) {
    const current = queue.shift()!;
    for (const other of picked) {
      if (!unseen.has(other.id) || !touches(current, other)) continue;
      unseen.delete(other.id);
      queue.push(other);
    }
  }
  return unseen.size === 0;
}

export type PickTurn =
  | { phase: "need-groups" }
  | { phase: "zone"; group: StudyGroup; members: Student[] }
  | { phase: "seat"; group: StudyGroup; student: Student }
  | { phase: "done" };

export function nextTurn(c: ClassData, assignments: Assignment = c.assignments): PickTurn {
  const ranked = groupsByPriority(c).filter((group) =>
    c.students.some((student) => student.groupId === group.id),
  );
  if (!(c.groups ?? []).length || !ranked.length) return { phase: "need-groups" };
  const seats = seatsOf(c);
  for (const group of ranked) {
    const members = membersByPoints(c.students, group.id);
    const zoneReady =
      group.zone.length === members.length && seatsAreTogether(seats, group.zone);
    if (!zoneReady) return { phase: "zone", group, members };
    const waiting = members.find((student) => {
      const seatId = studentSeat(assignments, student.id);
      return !seatId || !group.zone.includes(seatId);
    });
    if (waiting) return { phase: "seat", group, student: waiting };
  }
  return { phase: "done" };
}

export function zoneError(c: ClassData, groupId: string, seatIds: string[]) {
  const members = c.students.filter((student) => student.groupId === groupId);
  if (!members.length) return "这个小组还没有同学";
  if (seatIds.length !== members.length)
    return `请正好选择 ${members.length} 个连在一起的座位`;
  if (!seatsAreTogether(seatsOf(c), seatIds)) return "这些座位不连在一起，小组需要坐在一片";
  const overlap = (c.groups ?? []).find(
    (group) => group.id !== groupId && group.zone.some((seatId) => seatIds.includes(seatId)),
  );
  if (overlap) return `和${overlap.name}的区域重叠了`;
  return "";
}

export function moveFormation(
  c: ClassData,
  moverIds: string[],
  anchorId: string,
  targetSeatId: string,
) {
  if (moverIds.length < 2 || !moverIds.includes(anchorId))
    return { ok: false as const, reason: "先选中要一起移动的同学" };
  if (moverIds.some((studentId) => c.locks.includes(studentId)))
    return { ok: false as const, reason: "先解锁，再移动整组" };
  const seats = new Map(seatsOf(c).map((seat) => [seat.id, seat]));
  const anchor = seats.get(studentSeat(c.assignments, anchorId) ?? "");
  const target = seats.get(targetSeatId);
  if (!anchor || !target) return { ok: false as const, reason: "请拖到可用座位" };
  const rowShift = target.row - anchor.row;
  const deskShift = target.desk - anchor.desk;
  const sideShift = target.side - anchor.side;
  const nextSeats = new Map<string, string>();
  for (const moverId of moverIds) {
    const current = seats.get(studentSeat(c.assignments, moverId) ?? "");
    if (!current) return { ok: false as const, reason: "有同学还没有座位，不能整组移动" };
    const dest = `r${current.row + rowShift}-d${current.desk + deskShift}-s${current.side + sideShift}`;
    if (!seats.has(dest)) return { ok: false as const, reason: "这片座位放不下一整组" };
    nextSeats.set(moverId, dest);
  }
  const destinations = [...nextSeats.values()];
  if (new Set(destinations).size !== destinations.length)
    return { ok: false as const, reason: "移动后座位重叠了" };
  const movers = new Set(moverIds);
  for (const dest of destinations) {
    const occupant = c.assignments[dest];
    if (occupant && !movers.has(occupant))
      return { ok: false as const, reason: "目标座位上还有其他同学" };
  }
  const assignments = { ...c.assignments };
  for (const moverId of moverIds) {
    const from = studentSeat(assignments, moverId);
    if (from) delete assignments[from];
  }
  for (const [moverId, dest] of nextSeats) assignments[dest] = moverId;
  return { ok: true as const, assignments };
}

export function placeInZone(assignments: Assignment, studentId: string, seatId: string) {
  const next = { ...assignments };
  for (const [currentSeat, seatedId] of Object.entries(next)) {
    if (seatedId === studentId) delete next[currentSeat];
  }
  next[seatId] = studentId;
  return next;
}

export function assignZoneByPoints(
  c: ClassData,
  groupId: string,
  assignments: Assignment = c.assignments,
) {
  const group = (c.groups ?? []).find((item) => item.id === groupId);
  if (!group) return assignments;
  const members = membersByPoints(c.students, groupId);
  const seats = group.zone
    .map((seatId) => seatsOf(c).find((seat) => seat.id === seatId))
    .filter((seat): seat is Seat => !!seat)
    .sort((a, b) => a.row - b.row || a.desk - b.desk || a.side - b.side);
  const next = { ...assignments };
  const memberIds = new Set(members.map((student) => student.id));
  for (const [seatId, studentId] of Object.entries(next)) {
    if (memberIds.has(studentId)) delete next[seatId];
  }
  members.forEach((student, index) => {
    if (seats[index]) next[seats[index].id] = student.id;
  });
  return next;
}

export function freshGroup(c: ClassData, name: string): StudyGroup {
  const used = new Set((c.groups ?? []).map((group) => group.color));
  return {
    id: id(),
    name,
    color: groupColors.find((color) => !used.has(color)) ?? groupColors[(c.groups ?? []).length % groupColors.length],
    zone: [],
  };
}
