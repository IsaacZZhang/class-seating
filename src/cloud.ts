import { createClient } from "@supabase/supabase-js";
import { Assignment, ClassData, Layout, ProjectData, Student, StudyGroup } from "./model";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(url, key);

const activeKey = "class-seating-active";

type ClassRow = {
  id: string;
  name: string;
  layout: Layout;
  assignments: Assignment;
  rules: ClassData["rules"];
  locks: string[];
  protected_ids: string[];
  ignored_rule_ids: string[];
  published_ignored_rule_ids: string[];
  versions: ClassData["versions"];
  round: number;
  published: Assignment | null;
  published_layout: Layout | null;
  published_students: Student[] | null;
  published_at: string | null;
  pending: ClassData["pending"] | null;
  seating_mode: "individual" | "group";
  display_token: string;
};

type GroupRow = { id: string; class_id: string; name: string; color: string; zone: string[] };
type StudentRow = {
  id: string;
  class_id: string;
  group_id: string | null;
  name: string;
  number: string | null;
  note: string | null;
  gender: Student["gender"] | null;
  glasses: boolean;
  points: number;
};

function assemble(row: ClassRow, groups: GroupRow[], students: StudentRow[]): ClassData {
  return {
    id: row.id,
    name: row.name,
    layout: row.layout,
    assignments: row.assignments ?? {},
    rules: row.rules ?? [],
    locks: row.locks ?? [],
    protectedIds: row.protected_ids ?? [],
    ignoredRuleIds: row.ignored_rule_ids ?? [],
    publishedIgnoredRuleIds: row.published_ignored_rule_ids ?? [],
    versions: row.versions ?? [],
    round: row.round ?? 1,
    published: row.published ?? undefined,
    publishedLayout: row.published_layout ?? undefined,
    publishedStudents: row.published_students ?? undefined,
    publishedAt: row.published_at ?? undefined,
    pending: row.pending ?? undefined,
    seatingMode: row.seating_mode,
    displayToken: row.display_token,
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      color: group.color,
      zone: group.zone ?? [],
    })),
    students: students.map((student) => ({
      id: student.id,
      name: student.name,
      number: student.number ?? undefined,
      note: student.note ?? undefined,
      gender: student.gender ?? undefined,
      glasses: student.glasses,
      groupId: student.group_id ?? undefined,
      points: student.points ?? 0,
    })),
  };
}

export async function pullProject(): Promise<ProjectData> {
  const [classes, groups, students] = await Promise.all([
    supabase.from("classes").select("*").order("created_at"),
    supabase.from("groups").select("*"),
    supabase.from("students").select("*"),
  ]);
  if (classes.error) throw new Error(classes.error.message);
  if (groups.error) throw new Error(groups.error.message);
  if (students.error) throw new Error(students.error.message);
  const groupRows = (groups.data ?? []) as GroupRow[];
  const studentRows = (students.data ?? []) as StudentRow[];
  const list = ((classes.data ?? []) as ClassRow[]).map((row) =>
    assemble(
      row,
      groupRows.filter((group) => group.class_id === row.id),
      studentRows.filter((student) => student.class_id === row.id),
    ),
  );
  const stored = localStorage.getItem(activeKey);
  const activeClassId = list.some((item) => item.id === stored) ? stored! : (list[0]?.id ?? "");
  return { classes: list, activeClassId };
}

function classPayload(c: ClassData, teacherId: string) {
  return {
    id: c.id,
    teacher_id: teacherId,
    name: c.name,
    layout: c.layout,
    assignments: c.assignments,
    rules: c.rules,
    locks: c.locks,
    protected_ids: c.protectedIds,
    ignored_rule_ids: c.ignoredRuleIds,
    published_ignored_rule_ids: c.publishedIgnoredRuleIds ?? [],
    versions: c.versions,
    round: c.round,
    published: c.published ?? null,
    published_layout: c.publishedLayout ?? null,
    published_students: c.publishedStudents ?? null,
    published_at: c.publishedAt ?? null,
    pending: c.pending ?? null,
    seating_mode: c.seatingMode ?? "individual",
  };
}

export async function pushProject(data: ProjectData): Promise<true | string> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return userError?.message ?? "未登录";
  const teacherId = userData.user.id;
  localStorage.setItem(activeKey, data.activeClassId);
  const classIds = data.classes.map((item) => item.id);
  const saved = await supabase.from("classes").upsert(data.classes.map((item) => classPayload(item, teacherId)));
  if (saved.error) return saved.error.message;
  const groupRows = data.classes.flatMap((item) =>
    (item.groups ?? []).map((group: StudyGroup) => ({
      id: group.id,
      class_id: item.id,
      name: group.name,
      color: group.color,
      zone: group.zone ?? [],
    })),
  );
  if (groupRows.length) {
    const wrote = await supabase.from("groups").upsert(groupRows);
    if (wrote.error) return wrote.error.message;
  }
  const studentRows = data.classes.flatMap((item) =>
    item.students.map((student) => ({
      id: student.id,
      class_id: item.id,
      group_id: student.groupId ?? null,
      name: student.name,
      number: student.number ?? null,
      note: student.note ?? null,
      gender: student.gender ?? null,
      glasses: !!student.glasses,
    })),
  );
  if (studentRows.length) {
    const wrote = await supabase.from("students").upsert(studentRows);
    if (wrote.error) return wrote.error.message;
  }
  if (classIds.length) {
    const remoteStudents = await supabase.from("students").select("id").in("class_id", classIds);
    const remoteGroups = await supabase.from("groups").select("id").in("class_id", classIds);
    if (remoteStudents.error) return remoteStudents.error.message;
    if (remoteGroups.error) return remoteGroups.error.message;
    const keepStudents = new Set(studentRows.map((student) => student.id));
    const keepGroups = new Set(groupRows.map((group) => group.id));
    const dropStudents = (remoteStudents.data ?? []).map((row) => row.id).filter((studentId) => !keepStudents.has(studentId));
    const dropGroups = (remoteGroups.data ?? []).map((row) => row.id).filter((groupId) => !keepGroups.has(groupId));
    if (dropStudents.length) {
      const removed = await supabase.from("students").delete().in("id", dropStudents);
      if (removed.error) return removed.error.message;
    }
    if (dropGroups.length) {
      const removed = await supabase.from("groups").delete().in("id", dropGroups);
      if (removed.error) return removed.error.message;
    }
  }
  return true;
}

export async function addPoints(studentId: string, delta: number, reason?: string) {
  const { data, error } = await supabase.rpc("add_points", {
    p_student_id: studentId,
    p_delta: delta,
    p_reason: reason ?? "",
  });
  if (error) throw new Error(error.message);
  return data as number;
}

export async function pinStatus() {
  const { data, error } = await supabase.rpc("teacher_pin_status");
  if (error) throw new Error(error.message);
  return data as "unset" | "set" | "anonymous";
}

export async function setPin(pin: string) {
  const { error } = await supabase.rpc("set_teacher_pin", { next_pin: pin });
  if (error) throw new Error(error.message);
}

export async function changePin(current: string, next: string) {
  const { error } = await supabase.rpc("change_teacher_pin", {
    current_pin: current,
    next_pin: next,
  });
  if (error) throw new Error(error.message);
}

export async function verifyPin(pin: string) {
  const { data, error } = await supabase.rpc("verify_teacher_pin", { pin });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export type TeacherProfile = {
  displayName: string;
  avatar: string;
  email: string;
};

export async function loadTeacherProfile(): Promise<TeacherProfile> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error(userError?.message ?? "未登录");
  const { data, error } = await supabase.rpc("teacher_profile");
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    displayName: row?.display_name ?? "",
    avatar: row?.avatar ?? "",
    email: userData.user.email ?? "",
  };
}

export async function saveTeacherProfile(displayName: string, avatar: string) {
  const { error } = await supabase.rpc("update_teacher_profile", {
    next_name: displayName,
    next_avatar: avatar,
  });
  if (error) throw new Error(error.message);
}

export type BoardPayload = {
  id: string;
  name: string;
  layout: Layout;
  assignments: Assignment;
  round: number;
  groups: StudyGroup[];
  students: Student[];
};

export async function loadBoard(token: string) {
  const { data, error } = await supabase.rpc("classroom_board", { token });
  if (error) throw new Error(error.message);
  return (data ?? null) as BoardPayload | null;
}
