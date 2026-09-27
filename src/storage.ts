import { Assignment, Layout, ProjectData } from "./model";
import { createSample } from "./sample";
import { seatsOf } from "./seating";
const KEY = "classroom-seating-v1";
export function hasStoredProject(): boolean {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

function layoutForAssignments(layout: Layout, assignments: Assignment): Layout {
  let rows = layout.rows;
  let desks = layout.desks;
  const rowPatterns = layout.rowPatterns?.map((pattern) => [...pattern]);
  for (const seatId of Object.keys(assignments)) {
    const match = /^r(\d+)-d(\d+)-s([01])$/.exec(seatId);
    if (match) {
      const row = Number(match[1]), desk = Number(match[2]), side = Number(match[3]);
      rows = Math.max(rows, row + 1);
      desks = Math.max(desks, desk + 1);
      if (rowPatterns) {
        rowPatterns[row] ??= Array(layout.desks).fill(2);
        while (rowPatterns[row].length <= desk) rowPatterns[row].push(2);
        rowPatterns[row][desk] = Math.max(rowPatterns[row][desk], side + 1);
      }
    }
  }
  return { ...structuredClone(layout), rows, desks, ...(rowPatterns ? { rowPatterns } : {}) };
}

export function migrateProject(data: ProjectData): ProjectData {
  for (const c of data.classes) {
    c.rules ??= [];
    c.locks ??= [];
    c.protectedIds ??= [];
    c.ignoredRuleIds ??= [];
    c.versions ??= [];
    const validSeats = new Set(seatsOf(c).map((seat) => seat.id));
    c.assignments = Object.fromEntries(Object.entries(c.assignments).filter(([seatId]) => validSeats.has(seatId)));
    if (c.published) {
      c.publishedLayout ??= layoutForAssignments(c.layout, c.published);
      c.publishedStudents ??= structuredClone(c.students);
    }
    for (const version of c.versions) {
      version.layout ??= layoutForAssignments(c.layout, version.assignments);
      version.students ??= structuredClone(c.students);
    }
    if (c.pending) {
      c.pending.layout ??= layoutForAssignments(
        c.layout,
        c.pending.assignments,
      );
      c.pending.students ??= structuredClone(c.students);
    }
  }
  return data;
}

export function loadProject(): ProjectData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProjectData;
      if (
        Array.isArray(parsed.classes) &&
        typeof parsed.activeClassId === "string" &&
        parsed.classes.every(
          (c) => Array.isArray(c.students) && c.layout && c.assignments,
        )
      )
        return migrateProject(parsed);
    }
  } catch {
    /* invalid or unavailable storage */
  }
  return createSample();
}
export function saveProject(data: ProjectData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
