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
  /** Manually assigned duty monitor seats beside the podium. */
  podiumSeats?: ("left" | "right")[];
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
  podiumSide?: "left" | "right";
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
export const id = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
