export type Priority = "must" | "prefer";
export type SeatNeed = "front" | "back" | "middle" | "edge" | "window" | "door";
export type RelationKind =
  | "notDesk"
  | "notAdjacent"
  | "distance2"
  | "differentGroup"
  | "sameDesk"
  | "sameGroup";
export type RuleScope = "always" | "round" | "until";
export type Gender = "boy" | "girl";
export type GenderPreference = "any" | "same" | "different";
export type Student = {
  id: string;
  name: string;
  number?: string;
  note?: string;
  gender?: Gender;
  glasses?: boolean;
  groupId?: string;
  points?: number;
};
export type StudyGroup = {
  id: string;
  name: string;
  color: string;
  zone: string[];
};
export type Rule = {
  id: string;
  type: "need" | "relation";
  studentId: string;
  targetId?: string;
  need?: SeatNeed;
  relation?: RelationKind;
  priority: Priority;
  scope: RuleScope;
  appliesToRound?: number;
  until?: string;
  note?: string;
};
export type Layout = {
  rows: number;
  desks: number;
  /** Each row lists desk capacities from left to right. Missing means legacy double desks. */
  rowPatterns?: number[][];
  disabled: string[];
  doorSide: "left" | "right";
  windowSide: "left" | "right";
};
export type Assignment = Record<string, string>;
export type Version = {
  id: string;
  round: number;
  at: string;
  effectiveDate?: string;
  semesterWeek?: number;
  note?: string;
  assignments: Assignment;
  layout?: Layout;
  students?: Student[];
  label: string;
};
export type ClassData = {
  id: string;
  name: string;
  students: Student[];
  layout: Layout;
  assignments: Assignment;
  rules: Rule[];
  locks: string[];
  protectedIds: string[];
  ignoredRuleIds: string[];
  publishedIgnoredRuleIds?: string[];
  versions: Version[];
  round: number;
  published?: Assignment;
  publishedLayout?: Layout;
  publishedStudents?: Student[];
  publishedAt?: string;
  groups?: StudyGroup[];
  seatingMode?: "individual" | "group";
  displayToken?: string;
  pending?: {
    assignments: Assignment;
    layout?: Layout;
    students?: Student[];
    ignoredRuleIds?: string[];
    round: number;
    at: string;
    effectiveDate?: string;
    semesterWeek?: number;
    note?: string;
  };
};
export type ProjectData = { classes: ClassData[]; activeClassId: string };
export type Seat = {
  id: string;
  row: number;
  desk: number;
  side: number;
  col: number;
  capacity?: number;
};
export type Issue = {
  id: string;
  ruleId?: string;
  studentIds: string[];
  message: string;
  severity: "must" | "prefer" | "info";
};
export type Goal =
  "steady" | "rotate" | "partner" | "order" | "support" | "fresh";
export type Proposal = {
  id: string;
  label: string;
  description: string;
  assignments: Assignment;
  changed: number;
  issues: Issue[];
  newPartners: number;
  kind?: "optimized" | "pattern";
  method?: string;
};
export const id = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;
