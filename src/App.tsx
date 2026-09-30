import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  FileSpreadsheet,
  History,
  LayoutGrid,
  LockKeyhole,
  Maximize2,
  MoreHorizontal,
  Plus,
  Printer,
  Redo2,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Shuffle,
  Sparkles,
  UnlockKeyhole,
  Upload,
  Users,
  WandSparkles,
  X,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import readXlsxFile from "read-excel-file";
import {
  Adjustment,
  activeRules,
  changedCount,
  explain,
  fairness,
  generate,
  generatePatternProposals,
  inspect,
  localSuggestions,
  makeEmptyClass,
  moveStudentToSeat,
  needText,
  parseGender,
  parseNames,
  partnerOf,
  relationText,
  rowPattern,
  ruleText,
  seatLabel,
  seatsOf,
  studentName,
  studentSeat,
} from "./seating";
import {
  Assignment,
  ClassData,
  Gender,
  GenderPreference,
  Goal,
  Issue,
  Layout,
  Priority,
  ProjectData,
  Proposal,
  RelationKind,
  Rule,
  RuleScope,
  SeatNeed,
  Student,
  Version,
  id,
} from "./model";
import { migrateProject } from "./storage";
import { addPoints, changePin, pinStatus, pullProject, pushProject, setPin, supabase, verifyPin } from "./cloud";
import { freshGroup, moveFormation } from "./groups";
import { AccountMenu } from "./account";
import { PinDialog } from "./meeting";
import boyAvatar from "../ui/png/男生无眼镜.png";
import boyGlassesAvatar from "../ui/png/男生戴眼镜.png";
import girlAvatar from "../ui/png/女生无眼镜.png";
import girlGlassesAvatar from "../ui/png/女生戴眼镜.png";
import deskIllustration from "../ui/assert/ChatGPT 图像 2026年9月27日 21_58_52-3.png";

type Panel =
  | "none"
  | "rules"
  | "import"
  | "generate"
  | "publish"
  | "print"
  | "newclass"
  | "adjust"
  | "backup";
type GenerateStep = "goal" | "review" | "results";
type View = "classroom" | "roster" | "layout" | "trajectory" | "history" | "groups";
type OnboardingStep = "welcome" | "class" | "students" | "layout";
type TrajectoryPoint = { seatId: string; round: number; at: string };
type ComparisonSnapshot = { label: string; c: ClassData; assignments: Assignment; meta?: string };
type SeatMotion = { fromSeat: string; toSeat: string; swap: boolean; token: number };
const goalOptions: {
  id: Goal;
  title: string;
  detail: string;
  icon: typeof Sparkles;
}[] = [
  {
    id: "steady",
    title: "尽量少动",
    detail: "保留现在座位，大部分学生不变",
    icon: LockKeyhole,
  },
  {
    id: "rotate",
    title: "轮换位置",
    detail: "最近坐后面的往前一些",
    icon: RotateCcw,
  },
  {
    id: "partner",
    title: "换换同桌",
    detail: "尝试近期没有坐过的新同桌",
    icon: Users,
  },
  {
    id: "order",
    title: "改善课堂秩序",
    detail: "优先处理已设置的学生关系",
    icon: ShieldCheck,
  },
  {
    id: "support",
    title: "学习互助",
    detail: "优先满足互助关系",
    icon: BookOpen,
  },
  { id: "fresh", title: "重新安排", detail: "整体重新优化", icon: Shuffle },
];
const needOptions: { value: SeatNeed; label: string }[] = Object.entries(
  needText,
).map(([value, label]) => ({ value: value as SeatNeed, label }));
const relationOptions: { value: RelationKind; label: string }[] =
  Object.entries(relationText).map(([value, label]) => ({
    value: value as RelationKind,
    label,
  }));
function StudentAvatar({ student }: { student: Student }) {
  const source = student.gender === "boy"
    ? student.glasses ? boyGlassesAvatar : boyAvatar
    : student.gender === "girl"
      ? student.glasses ? girlGlassesAvatar : girlAvatar
      : undefined;
  return <span className={`avatar student-avatar ${student.gender ?? "unknown"}`}>
    {source ? <img src={source} alt={student.gender === "boy" ? "男生" : "女生"} /> : student.name.slice(0, 1)}
  </span>;
}
const clone = <T,>(v: T): T => structuredClone(v);
const dateText = (value?: string) => value
  ? /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value.replace(/-/g, "/")
    : new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "numeric", day: "numeric" })
  : "暂无";
const todayInput = () => {
  const day = new Date();
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
};
const versionDate = (version: Version) => version.effectiveDate || version.at;
const versionMeta = (version: Version) => [dateText(versionDate(version)), version.semesterWeek ? `第 ${version.semesterWeek} 周` : "", version.note || ""].filter(Boolean).join(" · ");
function setStudentDragImage(event: React.DragEvent, student: Student) {
  const preview = document.createElement("div");
  preview.className = "student-drag-preview";
  preview.textContent = student.name;
  document.body.appendChild(preview);
  event.dataTransfer.setDragImage(preview, 18, 16);
  requestAnimationFrame(() => preview.remove());
}

function parseIntent(
  text: string,
  c: ClassData,
): { rules: Rule[]; locks: string[]; messages: string[] } {
  const rules: Rule[] = [];
  const locks: string[] = [];
  const messages: string[] = [];
  for (const clause of text
    .split(/[，,。；;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    const names = c.students
      .filter((s) => clause.includes(s.name))
      .sort((a, b) => b.name.length - a.name.length);
    const mentioned = names.filter(
      (s, i) =>
        !names.slice(0, i).some((longer) => longer.name.includes(s.name)),
    );
    if (
      mentioned.length === 2 &&
      /分开|不同桌|不要坐一起|保持距离/.test(clause)
    ) {
      const relation: RelationKind = /保持距离/.test(clause)
        ? "distance2"
        : "notDesk";
      const exists = c.rules.some(
        (r) =>
          r.type === "relation" &&
          r.relation === relation &&
          [r.studentId, r.targetId].includes(mentioned[0].id) &&
          [r.studentId, r.targetId].includes(mentioned[1].id),
      );
      if (!exists)
        rules.push({
          id: id(),
          type: "relation",
          studentId: mentioned[0].id,
          targetId: mentioned[1].id,
          relation,
          priority: "must",
          scope: "round",
          appliesToRound: c.published ? c.round + 1 : c.round,
        });
      messages.push(
        `${mentioned[0].name}与${mentioned[1].name} ${relationText[relation]}${exists ? "（已有规则）" : "（仅本轮）"}`,
      );
    }
    if (mentioned.length === 1 && /不动|锁定|固定/.test(clause)) {
      locks.push(mentioned[0].id);
      messages.push(`锁定${mentioned[0].name}的位置`);
    }
    if (mentioned.length === 1 && /前三排|靠前/.test(clause)) {
      rules.push({
        id: id(),
        type: "need",
        studentId: mentioned[0].id,
        need: "front",
        priority: "must",
        scope: "round",
        appliesToRound: c.published ? c.round + 1 : c.round,
      });
      messages.push(`${mentioned[0].name}安排在前三排（仅本轮）`);
    }
  }
  if (/后排.*(往前|轮换)|轮换.*前排/.test(text))
    messages.push("本次优先前后轮换（请在目标中选择“轮换位置”）");
  return { rules, locks, messages };
}

function SeatBoard({
  c,
  assignments,
  onSeat,
  onDropStudent,
  selected,
  query,
  layoutMode = false,
  dragged,
  setDragged,
  zoom = 1,
  publicMode = false,
  previous,
  highlightChanges = false,
  readOnly = false,
  trajectory = [],
  focusStudentId,
  doneRows = [],
  motion,
  markedSeats = [],
  frozen = false,
  dragCohort = [],
  showScore = false,
  markEmpty = true,
}: {
  c: ClassData;
  assignments: Assignment;
  onSeat?: (seatId: string, event?: React.MouseEvent) => void;
  onDropStudent?: (studentId: string, seatId: string) => void;
  selected?: string[];
  query?: string;
  layoutMode?: boolean;
  dragged?: string;
  setDragged?: (studentId: string | undefined) => void;
  zoom?: number;
  publicMode?: boolean;
  previous?: Assignment;
  highlightChanges?: boolean;
  readOnly?: boolean;
  trajectory?: TrajectoryPoint[];
  focusStudentId?: string;
  doneRows?: number[];
  motion?: SeatMotion;
  markedSeats?: string[];
  frozen?: boolean;
  dragCohort?: string[];
  showScore?: boolean;
  markEmpty?: boolean;
}) {
  const rowsRef = useRef<HTMLDivElement>(null);
  const focused = focusStudentId !== undefined;
  const arrowheadId = useId();
  const [arrows, setArrows] = useState<string[]>([]);
  useLayoutEffect(() => {
    if (!motion || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = rowsRef.current;
    const seat = (id: string) => [...(root?.querySelectorAll<HTMLElement>("[data-seat-id]") ?? [])]
      .find((node) => node.dataset.seatId === id);
    const from = seat(motion.fromSeat);
    const to = seat(motion.toSeat);
    if (!from || !to) return;
    const fromRect = from.getBoundingClientRect();
    const toRect = to.getBoundingClientRect();
    const animate = (element: HTMLElement, dx: number, dy: number) => {
      element.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(1.06)` },
          { transform: "translate(0, 0) scale(1)" },
        ],
        { duration: 520, easing: "cubic-bezier(.22,.8,.25,1)" },
      );
    };
    animate(to, fromRect.left - toRect.left, fromRect.top - toRect.top);
    if (motion.swap) animate(from, toRect.left - fromRect.left, toRect.top - fromRect.top);
  }, [motion?.token]);
  const trajectoryKey = trajectory.map((point) => `${point.seatId}:${point.at}`).join("|");
  useLayoutEffect(() => {
    const root = rowsRef.current;
    if (!root || trajectory.length < 2) { setArrows([]); return; }
    const measure = () => {
      const bounds = root.getBoundingClientRect();
      const nodes = [...root.querySelectorAll<HTMLElement>("[data-seat-id]")];
      const points = trajectory.map((point) => {
        const node = nodes.find((item) => item.dataset.seatId === point.seatId);
        if (!node) return undefined;
        const rect = node.getBoundingClientRect();
        return { seatId: point.seatId, x: rect.left + rect.width / 2 - bounds.left, y: rect.top + rect.height / 2 - bounds.top, width: rect.width, height: rect.height };
      }).filter((point): point is { seatId: string; x: number; y: number; width: number; height: number } => !!point);
      setArrows(points.slice(1).flatMap((point, i) => {
        const from = points[i];
        if (point.seatId === from.seatId) return [];
        const dy = point.y - from.y;
        if (Math.abs(dy) < Math.min(from.height, point.height) * 0.55) {
          const startY = from.y - from.height / 2 - 6;
          const endY = point.y - point.height / 2 - 6;
          const laneY = Math.min(startY, endY) - 17 - (i % 3) * 6;
          return [`M ${from.x} ${startY} C ${from.x} ${laneY}, ${point.x} ${laneY}, ${point.x} ${endY}`];
        }
        const direction = Math.sign(dy);
        const startY = from.y + direction * (from.height / 2 + 8);
        const endY = point.y - direction * (point.height / 2 + 10);
        const laneY = (startY + endY) / 2;
        return [`M ${from.x} ${startY} C ${from.x} ${laneY}, ${point.x} ${laneY}, ${point.x} ${endY}`];
      }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root.querySelectorAll<HTMLElement>("[data-seat-id]").forEach((node) => observer.observe(node));
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [trajectoryKey, c.layout, zoom]);
  const seatMap = new Map(seatsOf(c).map((s) => [s.id, s]));
  const issues = publicMode || layoutMode || focused ? [] : inspect(c, assignments);
  const issuesByStudent = new Map<string, Issue[]>();
  issues.forEach((issue) =>
    issue.studentIds.forEach((s) =>
      issuesByStudent.set(s, [...(issuesByStudent.get(s) ?? []), issue]),
    ),
  );
  return (
    <div
      className={`classroom ${publicMode ? "classroom-public" : ""} ${readOnly ? "classroom-readonly" : ""} ${frozen ? "stage-locked" : ""} ${layoutMode ? "classroom-layout" : ""} ${focused ? "classroom-focus" : ""}`}
      style={{ "--seat-zoom": zoom, "--row-count": c.layout.rows, "--row-seat-ratio": 1.04 / c.layout.rows } as React.CSSProperties}
    >
      <div className="classroom-front">
        <span className="window-label">
          窗 · {c.layout.windowSide === "left" ? "左" : "右"}
        </span>
        <div className="blackboard">
          黑板 <small>讲台在这一侧</small>
        </div>
        <span className="door-label">
          门 · {c.layout.doorSide === "right" ? "右" : "左"}
        </span>
      </div>
      <div className="rows" ref={rowsRef}>
        {arrows.length > 0 && <svg className="trajectory-arrows" aria-hidden="true"><defs><marker id={arrowheadId} markerWidth="11" markerHeight="11" refX="9" refY="5.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 L9 5.5 L1 10" fill="none" stroke="#b85e1b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></marker></defs>{arrows.map((path, i) => <g key={i}><path className="trajectory-arrow-halo" d={path} /><path className="trajectory-arrow-line" d={path} markerEnd={`url(#${arrowheadId})`} /></g>)}</svg>}
        {Array.from({ length: c.layout.rows }, (_, row) => (
          <div
            className={`seat-row ${doneRows.includes(row) ? "row-done" : ""}`}
            key={row}
          >
            <div className="row-label">第 {row + 1} 排</div>
            <div
              className="desks"
              style={{
                gridTemplateColumns: `repeat(${Math.max(1, rowPattern(c.layout, row).length)},minmax(0,1fr))`,
              }}
            >
              {rowPattern(c.layout, row).map((capacity, desk) => {
                const hasUsableSeat = Array.from({ length: capacity }, (_, side) => seatMap.has(`r${row}-d${desk}-s${side}`)).some(Boolean);
                if (!layoutMode && !hasUsableSeat) return null;
                return <div className="desk" key={desk} style={{ gridColumn: desk + 1 }}>
                  {Array.from({ length: capacity }, (_, side) => side).map((side) => {
                    const seatId = `r${row}-d${desk}-s${side}`;
                    const disabled = !seatMap.has(seatId);
                    if (disabled && !layoutMode) return <span key={seatId} className="seat-hidden" aria-hidden="true" />;
                    const stops = trajectory.map((point, index) => ({ ...point, index: index + 1 })).filter((point) => point.seatId === seatId);
                    const studentId = layoutMode ? undefined : focused ? (stops.length ? focusStudentId : undefined) : assignments[seatId];
                    const student = c.students.find((s) => s.id === studentId);
                    const groupMark = student?.groupId
                      ? (c.groups ?? []).find((group) => group.id === student.groupId)
                      : (c.groups ?? []).find((group) => group.zone.includes(seatId));
                    const studentIssues = (studentId ? issuesByStudent.get(studentId) : undefined) ?? [];
                    const changed =
                      highlightChanges &&
                      studentId &&
                      previous &&
                      studentSeat(previous, studentId) !== seatId;
                    const prevSeat =
                      changed && previous
                        ? seatMap.get(studentSeat(previous, studentId) ?? "")
                        : undefined;
                    const match = query && student?.name.includes(query.trim());
                    const dim = query && query.trim() && !match;
                    const draggedSeat = dragged ? studentSeat(c.assignments, dragged) : undefined;
                    const draggedNeedsSeat = !!dragged && (!draggedSeat || !seatMap.has(draggedSeat));
                    const movingGroup = dragCohort.length > 1 && !!dragged && dragCohort.includes(dragged);
                    const occupant = assignments[seatId];
                    const canDrop = !!dragged && !!onDropStudent && !disabled && !readOnly && !layoutMode && !publicMode && !frozen && !c.locks.includes(dragged) && (movingGroup ? !dragCohort.some((id) => c.locks.includes(id)) && (!occupant || dragCohort.includes(occupant)) : !c.locks.includes(occupant) && (!draggedNeedsSeat || !occupant));
                    return (
                      <button
                        type="button"
                        key={seatId}
                        data-seat-id={seatId}
                        title={
                          disabled
                            ? "停用座位，点击启用"
                            : layoutMode
                              ? "可用座位，点击停用"
                              : focused && !stops.length
                                ? "其他座位"
                            : student
                              ? `${student.name} · ${seatLabel(seatMap.get(seatId))}${changed ? ` · 上次 ${seatLabel(prevSeat)}` : ""}`
                              : `空位 · 第 ${row + 1} 排`
                        }
                        className={`seat ${disabled ? "disabled" : ""} ${!student ? "empty" : ""} ${studentId && selected?.includes(studentId) ? "selected" : ""} ${markedSeats.includes(seatId) ? "zone-mark" : ""} ${studentId && c.locks.includes(studentId) && !publicMode && !frozen ? "locked" : ""} ${studentIssues.some((i) => i.severity === "must") ? "conflict" : ""} ${studentIssues.some((i) => i.severity === "prefer") ? "warning" : ""} ${changed ? "changed" : ""} ${highlightChanges && changed ? "proposal-changed" : ""} ${stops.length ? "trajectory-seat" : ""} ${dim ? "dim" : ""} ${match ? "match" : ""} ${canDrop ? "drop-candidate" : ""} ${dragged && studentId && (dragged === studentId || (dragCohort.includes(studentId) && dragCohort.includes(dragged))) ? "drag-origin" : ""}`}
                        onClick={(e) => {
                          if (!frozen) onSeat?.(seatId, e);
                        }}
                        disabled={!frozen && (publicMode || readOnly || (!layoutMode && disabled))}
                        draggable={
                          !frozen &&
                          !publicMode && !readOnly &&
                          !layoutMode &&
                          !!studentId &&
                          !c.locks.includes(studentId)
                        }
                        onDragStart={(e) => {
                          if (studentId) {
                            const cohort = dragCohort.length > 1 && dragCohort.includes(studentId) ? dragCohort : undefined;
                            e.dataTransfer.setData("text/plain", cohort ? `formation:${studentId}:${cohort.join(",")}` : studentId);
                            e.dataTransfer.effectAllowed = "move";
                            setDragged?.(studentId);
                          }
                        }}
                        onDragEnd={() => {
                          setDragged?.(undefined);
                        }}
                        onDragEnter={(e) => {
                          if (onDropStudent && !disabled && !readOnly && !frozen && !layoutMode && !publicMode) e.preventDefault();
                        }}
                        onDragOver={(e) => {
                          if (onDropStudent && !disabled && !readOnly && !frozen && !layoutMode && !publicMode) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const source = e.dataTransfer.getData("text/plain") || dragged;
                          if (!disabled && !readOnly && !frozen && !layoutMode && !publicMode && source) onDropStudent?.(source, seatId);
                          setDragged?.(undefined);
                        }}
                      >
                        {disabled ? (
                          <span className="seat-disabled-mark">＋</span>
                        ) : (
                          <>
                            {groupMark && <span className="group-stripe" style={{ background: groupMark.color }} />}
                            {student && <StudentAvatar student={student} />}
                            <span className="seat-name">
                              {dragged && dragged === studentId
                                ? "移动中…"
                                : (student?.name ??
                                  (layoutMode ? "可用" : frozen || focused || !markEmpty ? "" : "＋"))}
                            </span>
                            {student && (showScore || !!c.groups?.length || !!student.points) && <span className="seat-points">{student.points ?? 0}</span>}
                            {changed && <span className="seat-change-badge">变</span>}
                            {stops.length > 0 && <span className="trajectory-stops">{stops.map((stop) => <span key={stop.index} title={`第 ${stop.round} 轮 · ${dateText(stop.at)}`}><b>{stop.index}</b><small>{dateText(stop.at)}</small></span>)}</span>}
                            {!publicMode && !frozen && !layoutMode && !focused &&
                              student &&
                              dragged !== studentId && (
                                <span className="seat-symbols">
                                  {c.locks.includes(student.id) && (
                                    <LockKeyhole
                                      size={12}
                                      aria-label="已锁定"
                                    />
                                  )}
                                  {activeRules(c).some(
                                    (r) =>
                                      r.studentId === student.id ||
                                      r.targetId === student.id,
                                  ) && <i aria-label="有规则" />}
                                  {studentIssues.some(
                                    (i) => i.severity === "must",
                                  ) && (
                                    <CircleAlert
                                      size={13}
                                      aria-label="有冲突"
                                    />
                                  )}
                                  {changed && (
                                    <ArrowDownUp
                                      size={12}
                                      aria-label="本轮变化"
                                    />
                                  )}
                                </span>
                              )}
                            {highlightChanges && changed && prevSeat && (
                              <span className="seat-old">
                                原第 {prevSeat.row + 1} 排
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>;
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="classroom-back">
        后排 <span>过道将双人桌分成小组</span>
      </div>
    </div>
  );
}

function ComparisonBoards({ left, right }: { left: ComparisonSnapshot; right: ComparisonSnapshot }) {
  const ids = new Set([...left.c.students.map((s) => s.id), ...right.c.students.map((s) => s.id)]);
  const moved = [...ids].filter((studentId) => studentSeat(left.assignments, studentId) !== studentSeat(right.assignments, studentId));
  const names = moved.map((studentId) => right.c.students.find((s) => s.id === studentId)?.name ?? left.c.students.find((s) => s.id === studentId)?.name ?? "未知学生");
  const displayClass = (snapshot: ComparisonSnapshot): ClassData => ({ ...snapshot.c, rules: [], locks: [], ignoredRuleIds: [] });
  return <div className="comparison">
    <div className="comparison-summary"><strong>{moved.length} 人座位变化</strong><span><i /> 蓝色桌椅表示相对于另一侧有变化</span>{names.length > 0 && <small>{names.slice(0, 10).join("、")}{names.length > 10 ? ` 等 ${names.length} 人` : ""}</small>}</div>
    <div className="comparison-grid">
      <section className="comparison-side"><div className="comparison-side-head"><span>左侧 · 原座位</span><h3>{left.label}</h3>{left.meta && <p>{left.meta}</p>}</div><SeatBoard c={displayClass(left)} assignments={left.assignments} previous={right.assignments} highlightChanges readOnly /></section>
      <section className="comparison-side"><div className="comparison-side-head"><span>右侧 · 对比座位</span><h3>{right.label}</h3>{right.meta && <p>{right.meta}</p>}</div><SeatBoard c={displayClass(right)} assignments={right.assignments} previous={left.assignments} highlightChanges readOnly /></section>
    </div>
  </div>;
}

export default function App({ initial }: { initial: ProjectData }) {
  const [project, setProject] = useState(initial);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep | null>(null);
  const projectRef = useRef(project);
  const [undoState, setUndoState] = useState<{
    past: ProjectData[];
    future: ProjectData[];
  }>({ past: [], future: [] });
  const historyRef = useRef(undoState);
  const [saveOkay, setSaveOkay] = useState(true);
  const [panel, setPanel] = useState<Panel>("none");
  const [view, setView] = useState<View>("classroom");
  const [rosterChecked, setRosterChecked] = useState<string[]>([]);
  const [expandedStudent, setExpandedStudent] = useState("");
  const [trajectoryStudent, setTrajectoryStudent] = useState("");
  const [trajectoryLimit, setTrajectoryLimit] = useState<"3" | "5" | "all">("3");
  const [trajectoryFrom, setTrajectoryFrom] = useState("");
  const [trajectoryTo, setTrajectoryTo] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [dragged, setDragged] = useState<string>();
  const [seatMotion, setSeatMotion] = useState<SeatMotion>();
  const [swapSource, setSwapSource] = useState<string>();
  const [zoom, setZoom] = useState(1);
  const [historyLeft, setHistoryLeft] = useState("published");
  const [historyRight, setHistoryRight] = useState("draft");
  const [layoutMode, setLayoutMode] = useState(false);
  const [publicMode, setPublicMode] = useState(false);
  const [moveStep, setMoveStep] = useState(0);
  const [printMode, setPrintMode] = useState<"teacher" | "student">("student");
  const [printPerspective, setPrintPerspective] = useState<
    "teacher" | "student"
  >("teacher");
  const [goal, setGoal] = useState<Goal>("steady");
  const [genderPreference, setGenderPreference] = useState<GenderPreference>("any");
  const [generateStep, setGenerateStep] = useState<GenerateStep>("goal");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalIndex, setProposalIndex] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [intent, setIntent] = useState("");
  const [intentConfirmed, setIntentConfirmed] = useState(false);
  const [adjustWish, setAdjustWish] = useState<Adjustment>("apart");
  const [adjustOther, setAdjustOther] = useState("");
  const [adjustProposals, setAdjustProposals] = useState<Proposal[]>([]);
  const [classNameInput, setClassNameInput] = useState("");
  const [editingStudent, setEditingStudent] = useState("");
  const [editingName, setEditingName] = useState("");
  const [pasteInput, setPasteInput] = useState("");
  const [importError, setImportError] = useState("");
  const [ruleType, setRuleType] = useState<"need" | "relation">("need");
  const [ruleStudent, setRuleStudent] = useState("");
  const [ruleTarget, setRuleTarget] = useState("");
  const [ruleNeed, setRuleNeed] = useState<SeatNeed>("front");
  const [ruleRelation, setRuleRelation] = useState<RelationKind>("notDesk");
  const [rulePriority, setRulePriority] = useState<Priority>("must");
  const [ruleScope, setRuleScope] = useState<RuleScope>("always");
  const [ruleUntil, setRuleUntil] = useState("");
  const [ruleNote, setRuleNote] = useState("");
  const [ruleEditingStudent, setRuleEditingStudent] = useState("");
  const [publishTiming, setPublishTiming] = useState<"now" | "later">("now");
  const [publishDate, setPublishDate] = useState(todayInput);
  const [publishWeek, setPublishWeek] = useState("");
  const [publishNote, setPublishNote] = useState("");
  const [toast, setToast] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = useRef(false);
  const applyingRemote = useRef(false);
  const [managed, setManaged] = useState(false);
  const [pinAsk, setPinAsk] = useState<"" | "verify" | "set" | "change">("");
  const c =
    project.classes.find((item) => item.id === project.activeClassId) ??
    project.classes[0];
  const validSeatIds = new Set(seatsOf(c).map((seat) => seat.id));
  const isUnseated = (studentId: string) => !validSeatIds.has(studentSeat(c.assignments, studentId) ?? "");
  const pendingCount = c.students.filter((student) => isUnseated(student.id)).length;
  const current =
    selected.length === 1
      ? c.students.find((s) => s.id === selected[0])
      : undefined;
  const currentIssue = current
    ? inspect(c, c.assignments).find(
        (i) => i.studentIds.includes(current.id) && i.ruleId,
      )
    : undefined;
  const preview =
    panel === "generate" &&
    generateStep === "results" &&
    proposals[proposalIndex]
      ? proposals[proposalIndex].assignments
      : c.assignments;
  const previewingProposal = panel === "generate" && generateStep === "results" && !!proposals[proposalIndex];
  const issues = useMemo(() => inspect(c, c.assignments), [c]);
  const fairnessIssues = useMemo(() => fairness(c), [c]);
  const draftChanged = c.published
    ? changedCount(c.published, c.assignments)
    : c.students.length;
  const hasDraftChanges =
    !c.published ||
    draftChanged > 0 ||
    JSON.stringify(c.layout) !==
      JSON.stringify(c.publishedLayout ?? c.layout) ||
    JSON.stringify(c.students.map((s) => [s.id, s.name, s.gender, s.glasses])) !==
      JSON.stringify(
        (c.publishedStudents ?? c.students).map((s) => [s.id, s.name, s.gender, s.glasses]),
      );
  const lastVersion = c.versions.slice().reverse().find((version) => version.round === c.round && version.at === c.publishedAt);
  const previousVersion = c.versions.filter((version) => version.round < c.round).at(-1);
  const draftRound = c.published && hasDraftChanges ? c.round + 1 : c.published ? c.round : 1;
  const historyOptions = [
    { value: "draft", label: `工作草稿 · 第 ${draftRound} 轮` },
    ...(c.published ? [{ value: "published", label: `当前正式版 · 第 ${c.round} 轮` }] : []),
    ...c.versions.filter((version) => version.id !== lastVersion?.id).reverse().map((version) => ({ value: version.id, label: `第 ${version.round} 轮 · ${dateText(versionDate(version))}` })),
  ];
  const snapshotFor = (key: string): ComparisonSnapshot => {
    if (key === "published" && c.published) return {
      label: `当前正式版 · 第 ${c.round} 轮`,
      c: { ...c, layout: c.publishedLayout ?? c.layout, students: c.publishedStudents ?? c.students },
      assignments: c.published,
      meta: lastVersion ? versionMeta(lastVersion) : dateText(c.publishedAt),
    };
    const version = c.versions.find((item) => item.id === key);
    if (version) return {
      label: `历史正式版 · 第 ${version.round} 轮`,
      c: { ...c, layout: version.layout ?? c.layout, students: version.students ?? c.students },
      assignments: version.assignments,
      meta: versionMeta(version),
    };
    return { label: `工作草稿 · 第 ${draftRound} 轮`, c, assignments: c.assignments, meta: hasDraftChanges ? "尚未发布" : "与当前正式版一致" };
  };
  const versionMatchesDraft = (version: Version) => changedCount(version.assignments, c.assignments) === 0
    && JSON.stringify(version.layout ?? c.layout) === JSON.stringify(c.layout)
    && JSON.stringify((version.students ?? c.students).map((s) => [s.id, s.name, s.gender, s.glasses])) === JSON.stringify(c.students.map((s) => [s.id, s.name, s.gender, s.glasses]));
  const active = activeRules(c);
  const suggestion = useMemo(() => parseIntent(intent, c), [intent, c]);
  const publicAssignment = c.published ?? c.assignments;
  const publicClass = {
    ...c,
    layout: c.publishedLayout ?? c.layout,
    students: c.publishedStudents ?? c.students,
  };
  const changedRows = Array.from(
    new Set(
      Object.entries(publicAssignment)
        .filter(
          ([seatId, sid]) => previousVersion?.assignments[seatId] !== sid,
        )
        .map(([seatId]) => Number(seatId.match(/^r(\d+)/)?.[1] ?? 0)),
    ),
  ).sort((a, b) => a - b);
  const moveRows = changedRows.length
    ? changedRows
    : Array.from({ length: publicClass.layout.rows }, (_, i) => i);

  useEffect(() => {
    if (applyingRemote.current) {
      applyingRemote.current = false;
      return;
    }
    dirty.current = true;
    const timer = window.setTimeout(() => {
      const snapshot = projectRef.current;
      void pushProject(snapshot).then(async (result) => {
        setSaveOkay(result === true);
        if (result !== true) {
          setToast(result);
          return;
        }
        try {
          const next = await pullProject();
          if (projectRef.current !== snapshot) return;
          next.activeClassId = snapshot.activeClassId;
          dirty.current = false;
          applyingRemote.current = true;
          projectRef.current = next;
          setProject(next);
        } catch {
          dirty.current = false;
        }
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [project]);
  useEffect(() => {
    let timer = 0;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (dirty.current) return;
        void pullProject()
          .then((next) => {
            if (dirty.current) return;
            const active = projectRef.current.activeClassId;
            if (next.classes.some((item) => item.id === active)) next.activeClassId = active;
            applyingRemote.current = true;
            projectRef.current = next;
            setProject(next);
          })
          .catch(() => setSaveOkay(false));
      }, 400);
    };
    const channel = supabase
      .channel("class-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "classes" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "point_events" }, refresh)
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, []);
  useEffect(() => {
    setDragged(undefined);
  }, [view]);
  useEffect(() => {
    if (!seatMotion) return;
    const timer = window.setTimeout(() => setSeatMotion(undefined), 600);
    return () => window.clearTimeout(timer);
  }, [seatMotion]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName) ||
        target?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (typing) return;
      if (e.key === "Escape") {
        setSelected([]);
        setPanel("none");
        setSwapSource(undefined);
        setPublicMode(false);
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key.toLowerCase() === "l" && selected.length) {
        e.preventDefault();
        toggleLocks();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  async function awardPoints(studentId: string, delta: number, reason?: string) {
    try {
      const points = await addPoints(studentId, delta, reason);
      commit((_, cl) => {
        const student = cl.students.find((item) => item.id === studentId);
        if (student) student.points = points;
      });
    } catch (error) {
      setToast(error instanceof Error ? error.message : "积分没有记上");
    }
  }
  async function openManage() {
    try {
      const status = await pinStatus();
      if (status === "anonymous") {
        setToast("请先登录，再进入管理。");
        return;
      }
      setPinAsk(status === "set" ? "verify" : "set");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "暂时无法读取 PIN");
    }
  }
  function lockStage() {
    setManaged(false);
    setSelected([]);
    setView("classroom");
    setPanel("none");
    setLayoutMode(false);
  }
  function putInGroup(studentIds: string[], groupId: string) {
    if (!studentIds.length) return;
    commit((_, cl) => {
      let nextId = groupId;
      if (groupId === "new") {
        const group = freshGroup(cl, `第 ${(cl.groups ?? []).length + 1} 组`);
        cl.groups = [...(cl.groups ?? []), group];
        nextId = group.id;
      }
      for (const student of cl.students) {
        if (!studentIds.includes(student.id)) continue;
        if (nextId) student.groupId = nextId;
        else delete student.groupId;
      }
    });
    setToast(groupId === "new" ? "已编成新的一组" : "已调整小组");
  }
  function leaveGroup(studentIds: string[]) {
    commit((_, cl) => {
      for (const student of cl.students) {
        if (studentIds.includes(student.id)) student.groupId = undefined;
      }
    });
  }
  function commit(update: (data: ProjectData, cl: ClassData) => void) {
    dirty.current = true;
    const before = projectRef.current;
    const next = clone(before);
    const cl =
      next.classes.find((item) => item.id === next.activeClassId) ??
      next.classes[0];
    update(next, cl);
    projectRef.current = next;
    setProject(next);
    const h = {
      past: [...historyRef.current.past, before].slice(-70),
      future: [] as ProjectData[],
    };
    historyRef.current = h;
    setUndoState(h);
  }
  function updateProject(update: (data: ProjectData) => void) {
    dirty.current = true;
    const next = clone(projectRef.current);
    update(next);
    projectRef.current = next;
    setProject(next);
  }
  function undo() {
    const h = historyRef.current;
    if (!h.past.length) return;
    const previous = h.past.at(-1)!;
    const now = projectRef.current;
    const next = { past: h.past.slice(0, -1), future: [now, ...h.future] };
    historyRef.current = next;
    projectRef.current = previous;
    setProject(previous);
    setUndoState(next);
  }
  function redo() {
    const h = historyRef.current;
    if (!h.future.length) return;
    const target = h.future[0];
    const now = projectRef.current;
    const next = { past: [...h.past, now], future: h.future.slice(1) };
    historyRef.current = next;
    projectRef.current = target;
    setProject(target);
    setUndoState(next);
  }
  function selectSeat(seatId: string, e?: React.MouseEvent) {
    if (layoutMode) {
      const displaced = !c.layout.disabled.includes(seatId) && !!c.assignments[seatId];
      commit((_, cl) => {
        cl.layout.disabled = cl.layout.disabled.includes(seatId)
          ? cl.layout.disabled.filter((s) => s !== seatId)
          : [...cl.layout.disabled, seatId];
        if (cl.layout.disabled.includes(seatId)) delete cl.assignments[seatId];
      });
      if (displaced) setToast("座位已停用，原座学生变为待安排，可撤销。");
      return;
    }
    if (!seatsOf(c).some((seat) => seat.id === seatId)) return;
    const sid = c.assignments[seatId];
    if (swapSource) {
      swapTo(swapSource, seatId);
      setSwapSource(undefined);
      return;
    }
    if (!sid) {
      setSelected([]);
      return;
    }
    if (e?.ctrlKey || e?.metaKey || e?.shiftKey)
      setSelected((prev) =>
        prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid],
      );
    else setSelected([sid]);
  }
  function swapTo(studentId: string, targetSeat: string) {
    if (studentId.startsWith("formation:")) {
      const [, anchor, packed] = studentId.split(":");
      const ids = (packed ?? "").split(",").filter(Boolean);
      const moved = moveFormation(c, ids, anchor, targetSeat);
      if (!moved.ok) {
        setToast(moved.reason);
        return;
      }
      const sourceSeat = studentSeat(c.assignments, anchor);
      if (sourceSeat && sourceSeat !== targetSeat)
        setSeatMotion({ fromSeat: sourceSeat, toSeat: targetSeat, swap: false, token: performance.now() });
      commit((_, cl) => {
        cl.assignments = moved.assignments;
      });
      setToast("这一组已经一起移动。可撤销。");
      return;
    }
    const sourceSeat = studentSeat(c.assignments, studentId);
    const result = moveStudentToSeat(c, studentId, targetSeat);
    if (!result.ok) {
      if (result.reason === "invalid-seat") setToast("该座位已停用，请选择可用座位。");
      if (result.reason === "occupied") setToast("待安排学生请拖到空位；如没有空位，请先增加座位。");
      if (result.reason === "locked") setToast("先解锁学生，再移动座位。");
      return;
    }
    const { otherId, wasUnseated } = result;
    if (sourceSeat && sourceSeat !== targetSeat)
      setSeatMotion({ fromSeat: sourceSeat, toSeat: targetSeat, swap: !!otherId, token: performance.now() });
    commit((_, cl) => {
      cl.assignments = result.assignments;
      cl.protectedIds = Array.from(
        new Set([...cl.protectedIds, studentId, ...(otherId ? [otherId] : [])]),
      );
    });
    setSelected([studentId]);
    setToast(
      otherId
        ? `${studentName(c, studentId)}与${studentName(c, otherId)}已交换。可撤销。`
        : `${studentName(c, studentId)}${wasUnseated ? "已安排座位" : "已移动"}。可撤销。`,
    );
  }
  function toggleLocks() {
    if (!selected.length) return;
    const all = c.locks;
    const shouldLock = selected.some((s) => !all.includes(s));
    commit((_, cl) => {
      cl.locks = shouldLock
        ? Array.from(new Set([...cl.locks, ...selected]))
        : cl.locks.filter((s) => !selected.includes(s));
    });
    setToast(
      shouldLock
        ? `已锁定 ${selected.length} 人`
        : `已解锁 ${selected.length} 人`,
    );
  }
  function openGenerate(nextRound = false) {
    setPanel("generate");
    setGenerateStep(nextRound ? "review" : "goal");
    setGoal(nextRound ? "rotate" : "steady");
    setProposals([]);
    setProposalIndex(0);
    setIntent("");
    setIntentConfirmed(false);
  }
  function runGenerate() {
    setGenerating(true);
    setTimeout(() => {
      const working = clone(
        projectRef.current.classes.find(
          (x) => x.id === projectRef.current.activeClassId,
        )!,
      );
      working.publishedIgnoredRuleIds = [];
      if (intentConfirmed) {
        working.rules.push(...suggestion.rules);
        working.locks = Array.from(
          new Set([...working.locks, ...suggestion.locks]),
        );
      }
      const result = [...generate(working, goal, genderPreference), ...(genderPreference === "any" ? generatePatternProposals(working) : [])];
      setProposals(result);
      setProposalIndex(0);
      setGenerateStep("results");
      setGenerating(false);
    }, 30);
  }
  function useProposal(p: Proposal) {
    const must = p.issues.filter((i) => i.severity === "must");
    if (must.length) {
      setToast("方案仍有必要规则未满足，请先处理冲突。");
      return;
    }
    commit((_, cl) => {
      if (intentConfirmed) {
        cl.rules.push(...suggestion.rules);
        cl.locks = Array.from(new Set([...cl.locks, ...suggestion.locks]));
      }
      cl.assignments = clone(p.assignments);
      cl.protectedIds = [];
    });
    setPanel("none");
    setToast(`已采用${p.label}，调整 ${p.changed} 人。当前仍是草稿。`);
  }
  function openHistory() {
    setHistoryLeft(c.published && hasDraftChanges ? "published" : previousVersion?.id ?? (c.published ? "published" : "draft"));
    setHistoryRight(c.published && !hasDraftChanges ? "published" : "draft");
    setView("history");
    setPanel("none");
  }
  function openAdjust() {
    if (!current) {
      setToast("先选择一名学生。");
      return;
    }
    setPanel("adjust");
    setAdjustWish("apart");
    setAdjustOther("");
    setAdjustProposals([]);
  }
  function repairSelected() {
    if (!current || !currentIssue?.ruleId) return;
    const rule = c.rules.find((r) => r.id === currentIssue.ruleId);
    let wish: Adjustment | undefined;
    let other = "";
    if (
      rule?.type === "need" &&
      ["front", "back", "middle", "edge"].includes(rule.need ?? "")
    )
      wish = rule.need as Adjustment;
    if (rule?.type === "relation" && rule.relation === "notDesk") {
      wish = "apart";
      other =
        rule.studentId === current.id ? (rule.targetId ?? "") : rule.studentId;
    }
    if (!wish) {
      setPanel("rules");
      return;
    }
    setAdjustWish(wish);
    setAdjustOther(other);
    setAdjustProposals(
      localSuggestions(c, current.id, wish, other || undefined).filter(
        (p) => !p.issues.some((i) => i.ruleId === rule?.id),
      ),
    );
    setPanel("adjust");
  }
  function findAdjust(wish: Adjustment = adjustWish, other = adjustOther) {
    if (!current) return;
    if (
      wish === "apart" &&
      other &&
      partnerOf(c, c.assignments, current.id) !== other
    ) {
      setToast("这两位学生现在已经不同桌。");
      return;
    }
    setAdjustProposals(
      localSuggestions(c, current.id, wish, other || undefined),
    );
  }
  function applyAdjust(p: Proposal) {
    commit((_, cl) => {
      cl.assignments = clone(p.assignments);
      cl.protectedIds = Array.from(
        new Set([
          ...cl.protectedIds,
          ...selected,
          ...Object.values(p.assignments).filter(
            (id) =>
              studentSeat(c.assignments, id) !== studentSeat(p.assignments, id),
          ),
        ]),
      );
    });
    setPanel("none");
    setToast(`已调整 ${p.changed} 人，可撤销。`);
  }
  function addNames(students: Student[]): boolean {
    if (!students.length) {
      setImportError("没有识别到姓名，请检查名单格式。");
      return false;
    }
    const existing = new Set(c.students.map((s) => s.name));
    const fresh = students.filter(
      (s) => !existing.has(s.name) && s.name.length <= 30,
    );
    if (!fresh.length) {
      setImportError("名单中的姓名都已存在，或格式不正确。");
      return false;
    }
    commit((_, cl) => {
      cl.students.push(...fresh);
      const occupied = new Set(Object.keys(cl.assignments));
      let pos = 0;
      for (const s of fresh) {
        const seat = seatsOf(cl).find(
          (x, i) => i >= pos && !occupied.has(x.id),
        );
        if (seat) {
          cl.assignments[seat.id] = s.id;
          occupied.add(seat.id);
          pos = seatsOf(cl).findIndex((x) => x.id === seat.id) + 1;
        }
      }
    });
    setImportError("");
    setPasteInput("");
    setPanel("none");
    setToast(`已加入 ${fresh.length} 名学生。`);
    return true;
  }
  async function importFile(file?: File): Promise<boolean> {
    if (!file) return false;
    try {
      const rows = file.name.toLowerCase().endsWith(".csv")
        ? (await file.text())
            .split(/\r?\n/)
            .map((line) => line.split(/[,，;；\t]/))
        : await readXlsxFile(file);
      const lines = rows
        .map((row) => row.map((v) => String(v ?? "").trim()))
        .filter((row) => row.some(Boolean));
      const nameColumn = lines[0]?.findIndex((v) => /姓名|名字|name/i.test(v));
      const genderColumn = lines[0]?.findIndex((v) => /^(性别|gender|sex)$/i.test(v));
      const students = lines
        .slice(nameColumn !== undefined && nameColumn >= 0 ? 1 : 0)
        .flatMap((row, index) => {
          const name = nameColumn !== undefined && nameColumn >= 0
            ? row[nameColumn]
            : row.find((value) => !/^[0-9]+$/.test(value));
          if (!name) return [];
          const student = parseNames(name)[0];
          if (!student) return [];
          const gender = genderColumn !== undefined && genderColumn >= 0 ? parseGender(row[genderColumn] ?? "") : row.length === 2 ? parseGender(row[1] ?? "") : undefined;
          return [{ ...student, number: String(index + 1), ...(gender ? { gender } : {}) }];
        });
      return addNames(students);
    } catch {
      setImportError(
        "文件读取失败。请使用 .xlsx 或 .csv，也可以直接粘贴名单。",
      );
      return false;
    }
  }
  function addRule(): boolean {
    if (
      !ruleStudent ||
      (ruleType === "relation" && (!ruleTarget || ruleTarget === ruleStudent))
    ) {
      setToast("请选择要设置的学生。");
      return false;
    }
    const rule: Rule = {
      id: id(),
      type: ruleType,
      studentId: ruleStudent,
      ...(ruleType === "need"
        ? { need: ruleNeed }
        : { targetId: ruleTarget, relation: ruleRelation }),
      priority: rulePriority,
      scope: ruleScope,
      ...(ruleScope === "round"
        ? { appliesToRound: c.published ? c.round + 1 : c.round }
        : {}),
      ...(ruleScope === "until" ? { until: ruleUntil } : {}),
      note: ruleNote,
    };
    commit((_, cl) => {
      cl.rules.push(rule);
    });
    setRuleNote("");
    setToast("规则已加入。");
    return true;
  }
  function renameStudent(studentId: string) {
    const name = editingName.trim();
    if (!name) {
      setEditingStudent("");
      return;
    }
    if (c.students.some((s) => s.id !== studentId && s.name === name)) {
      setToast("已有同名学生，请核对后再保存。");
      return;
    }
    commit((_, cl) => {
      const s = cl.students.find((x) => x.id === studentId);
      if (s) s.name = name;
    });
    setEditingStudent("");
  }
  function removeStudents(studentIds: string[]) {
    if (!studentIds.length) return;
    const removed = new Set(studentIds);
    commit((_, cl) => {
      cl.students = cl.students.filter((s) => !removed.has(s.id));
      cl.assignments = Object.fromEntries(Object.entries(cl.assignments).filter(([, sid]) => !removed.has(sid)));
      cl.rules = cl.rules.filter((r) => !removed.has(r.studentId) && (!r.targetId || !removed.has(r.targetId)));
      cl.locks = cl.locks.filter((sid) => !removed.has(sid));
      cl.protectedIds = cl.protectedIds.filter((sid) => !removed.has(sid));
    });
    setRosterChecked([]);
    if (removed.has(expandedStudent)) setExpandedStudent("");
    if (removed.has(trajectoryStudent)) setTrajectoryStudent("");
    if (removed.has(ruleEditingStudent)) setRuleEditingStudent("");
    setToast(`已移除 ${studentIds.length} 名学生，可撤销。`);
  }
  function updateLayout(layout: Layout) {
    const countBefore = Object.keys(c.assignments).length;
    const nextClass = { ...c, layout };
    const valid = new Set(seatsOf(nextClass).map((s) => s.id));
    const countAfter = Object.keys(c.assignments).filter((seatId) => valid.has(seatId)).length;
    commit((_, cl) => {
      cl.layout = layout;
      cl.assignments = Object.fromEntries(Object.entries(cl.assignments).filter(([seatId]) => valid.has(seatId)));
    });
    if (countBefore > countAfter) setToast(`${countBefore - countAfter} 名学生因座位移除变为待安排，可撤销。`);
  }
  function editRow(row: number, update: (pattern: number[]) => number[]) {
    const layout = clone(c.layout);
    layout.rowPatterns = Array.from({ length: layout.rows }, (_, i) => [...rowPattern(layout, i)]);
    layout.rowPatterns[row] = update(layout.rowPatterns[row]);
    layout.desks = Math.max(1, ...layout.rowPatterns.map((p) => p.length));
    updateLayout(layout);
  }
  function addRow() {
    if (c.layout.rows >= 12) return;
    const layout = clone(c.layout);
    layout.rowPatterns = Array.from({ length: layout.rows }, (_, i) => [...rowPattern(layout, i)]);
    layout.rowPatterns.push(Array(Math.max(1, layout.desks)).fill(2));
    layout.rows += 1;
    updateLayout(layout);
  }
  function addColumn(capacity: 1 | 2) {
    const layout = clone(c.layout);
    layout.rowPatterns = Array.from({ length: layout.rows }, (_, row) => [...rowPattern(layout, row)]);
    if (layout.rowPatterns.some((pattern) => pattern.length >= 8)) {
      setToast("已有排达到 8 组桌子的上限，请先单独调整。");
      return;
    }
    layout.rowPatterns = layout.rowPatterns.map((pattern) => [...pattern, capacity]);
    layout.desks = Math.max(...layout.rowPatterns.map((pattern) => pattern.length));
    updateLayout(layout);
    setToast(`已在每排末尾各添加 ${capacity === 1 ? "一个单人座" : "一组双人桌"}，可撤销。`);
  }
  function removeRow(row: number) {
    if (c.layout.rows <= 1) return;
    const layout = clone(c.layout);
    layout.rowPatterns = Array.from({ length: layout.rows }, (_, i) => [...rowPattern(layout, i)]);
    layout.rowPatterns.splice(row, 1);
    layout.rows -= 1;
    layout.desks = Math.max(1, ...layout.rowPatterns.map((pattern) => pattern.length));
    layout.disabled = layout.disabled.flatMap((seatId) => {
      const match = /^r(\d+)-d(\d+)-s(\d+)$/.exec(seatId);
      if (!match || Number(match[1]) === row) return [];
      const newRow = Number(match[1]) > row ? Number(match[1]) - 1 : Number(match[1]);
      return [`r${newRow}-d${match[2]}-s${match[3]}`];
    });
    const oldAssignments = c.assignments;
    const moved: Assignment = {};
    for (const [seatId, sid] of Object.entries(oldAssignments)) {
      const match = /^r(\d+)-d(\d+)-s(\d+)$/.exec(seatId);
      if (!match || Number(match[1]) === row) continue;
      const newRow = Number(match[1]) > row ? Number(match[1]) - 1 : Number(match[1]);
      moved[`r${newRow}-d${match[2]}-s${match[3]}`] = sid;
    }
    const valid = new Set(seatsOf({ ...c, layout }).map((seat) => seat.id));
    commit((_, cl) => { cl.layout = layout; cl.assignments = Object.fromEntries(Object.entries(moved).filter(([seatId]) => valid.has(seatId))); });
    setToast(`第 ${row + 1} 排已移除，原排学生变为待安排，可撤销。`);
  }
  function publish(override = false) {
    if (!publishDate) { setToast("请填写座位开始使用的日期。"); return; }
    const week = publishWeek.trim() ? Number(publishWeek) : undefined;
    if (week !== undefined && (!Number.isInteger(week) || week < 1 || week > 30)) { setToast("学期周次请填写 1 到 30 的整数。"); return; }
    const blockers = inspect(c, c.assignments).filter(
      (i) => i.severity === "must",
    );
    if (blockers.length && !override) {
      setToast("还有必要规则未满足，请先检查。");
      return;
    }
    if (override && blockers.some((i) => !i.ruleId)) {
      setToast("还有学生未安排或座位无效，暂不能发布。");
      return;
    }
    const now = new Date().toISOString();
    commit((_, cl) => {
      if (override)
        cl.ignoredRuleIds = Array.from(
          new Set([
            ...cl.ignoredRuleIds,
            ...blockers.map((i) => i.ruleId).filter((v): v is string => !!v),
          ]),
        );
      if (publishTiming === "later") {
        cl.pending = {
          assignments: clone(cl.assignments),
          layout: clone(cl.layout),
          students: clone(cl.students),
          ignoredRuleIds: clone(cl.ignoredRuleIds),
          round: cl.published ? cl.round + 1 : 1,
          at: now,
          effectiveDate: publishDate,
          semesterWeek: week,
          note: publishNote.trim(),
        };
        return;
      }
      cl.round = cl.published ? cl.round + 1 : 1;
      cl.published = clone(cl.assignments);
      cl.publishedLayout = clone(cl.layout);
      cl.publishedStudents = clone(cl.students);
      cl.publishedAt = now;
      cl.pending = undefined;
      cl.versions.push({
        id: id(),
        round: cl.round,
        at: now,
        effectiveDate: publishDate,
        semesterWeek: week,
        note: publishNote.trim(),
        assignments: clone(cl.assignments),
        layout: clone(cl.layout),
        students: clone(cl.students),
        label: `第 ${cl.round} 轮 · 当前使用`,
      });
      cl.protectedIds = [];
      cl.publishedIgnoredRuleIds = cl.ignoredRuleIds;
      cl.ignoredRuleIds = [];
    });
    setPanel("none");
    setPublishNote("");
    setPublishWeek("");
    setPublishDate(todayInput());
    setToast(
      publishTiming === "later"
        ? "已安排为下次换座时使用。"
        : "座位已发布，可以进入投影视图。",
    );
  }
  function activatePending() {
    if (!c.pending) return;
    const now = new Date().toISOString();
    commit((_, cl) => {
      const pending = cl.pending;
      if (!pending) return;
      cl.round = pending.round;
      cl.published = clone(pending.assignments);
      cl.assignments = clone(pending.assignments);
      cl.layout = clone(pending.layout ?? cl.layout);
      cl.students = clone(pending.students ?? cl.students);
      cl.publishedLayout = clone(cl.layout);
      cl.publishedStudents = clone(cl.students);
      cl.publishedAt = now;
      cl.versions.push({
        id: id(),
        round: cl.round,
        at: now,
        effectiveDate: pending.effectiveDate || todayInput(),
        semesterWeek: pending.semesterWeek,
        note: pending.note,
        assignments: clone(pending.assignments),
        layout: clone(cl.layout),
        students: clone(cl.students),
        label: `第 ${cl.round} 轮 · 当前使用`,
      });
      cl.pending = undefined;
      cl.protectedIds = [];
      cl.publishedIgnoredRuleIds = pending.ignoredRuleIds ?? cl.ignoredRuleIds;
      cl.ignoredRuleIds = [];
    });
    setToast("已开始使用新座位。");
  }
  function restoreVersion(version: Version) {
    if (versionMatchesDraft(version)) { setToast("当前工作草稿已是这一版，无需重复恢复。"); return; }
    commit((_, cl) => {
      cl.assignments = clone(version.assignments);
      if (version.layout) cl.layout = clone(version.layout);
      if (version.students) cl.students = clone(version.students);
      cl.protectedIds = [];
      cl.ignoredRuleIds = [];
    });
    setHistoryLeft(c.published ? "published" : version.id);
    setHistoryRight("draft");
    setToast(`已把第 ${version.round} 轮复制到工作草稿；正式版保持不变。`);
  }
  function deleteVersion(version: Version) {
    commit((_, cl) => {
      cl.versions = cl.versions.filter((item) => item.id !== version.id);
    });
    if (historyLeft === version.id) setHistoryLeft(c.published ? "published" : "draft");
    if (historyRight === version.id) setHistoryRight("draft");
    setToast(`第 ${version.round} 轮记录已删除。当前正式座位保留，可撤销。`);
  }
  function exportBackup() {
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "班级座位备份.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as ProjectData;
      if (
        !Array.isArray(data.classes) ||
        !data.classes.every(
          (x) => Array.isArray(x.students) && x.layout && x.assignments,
        )
      ) {
        throw Error();
      }
      const next = migrateProject(clone(data));
      projectRef.current = next;
      setProject(next);
      const cleared = { past: [], future: [] };
      historyRef.current = cleared;
      setUndoState(cleared);
      setPanel("none");
      setSelected([]);
      setToast("备份已导入。");
    } catch {
      setImportError("备份文件无效，请选择系统导出的 JSON 文件。");
    }
  }
  function openPrint(mode: "teacher" | "student") {
    setPrintMode(mode);
    setPanel("none");
    setTimeout(() => window.print(), 100);
  }
  function selectedHistory() {
    if (!current) return [];
    return c.versions.map((v) => ({
      version: v,
      seat: seatsOf({ ...c, layout: v.layout ?? c.layout }).find(
        (s) => s.id === studentSeat(v.assignments, current.id),
      ),
      partner: partnerOf(c, v.assignments, current.id),
    }));
  }
  const visibleStudents = c.students.filter(
    (s) => s.name.includes(search.trim()) || s.number?.includes(search.trim()),
  ).sort((a, b) => Number(isUnseated(b.id)) - Number(isUnseated(a.id)));
  function startOnboardingClass() {
    const name = classNameInput.trim();
    if (!name) { setImportError("先输入班级名称。"); return; }
    const nextClass = makeEmptyClass(name);
    const next = { classes: [nextClass], activeClassId: nextClass.id };
    projectRef.current = next;
    setProject(next);
    setImportError("");
    setOnboardingStep("students");
  }
  function finishOnboarding(openLayout: boolean) {
    const cleared = { past: [], future: [] };
    historyRef.current = cleared;
    setUndoState(cleared);
    setView(openLayout ? "layout" : "classroom");
    setLayoutMode(openLayout);
    setPanel("none");
    setOnboardingStep(null);
  }
  const activeTrajectoryStudent = view === "roster" ? expandedStudent : trajectoryStudent;
  const trajectoryHistory = c.versions.filter((version) => {
    const day = versionDate(version).slice(0, 10);
    return (!trajectoryFrom || day >= trajectoryFrom) && (!trajectoryTo || day <= trajectoryTo);
  }).sort((a, b) => versionDate(a).localeCompare(versionDate(b)) || a.at.localeCompare(b.at));
  const shownTrajectoryHistory = trajectoryLimit === "all" ? trajectoryHistory : trajectoryHistory.slice(-Number(trajectoryLimit));
  const trajectoryPoints: TrajectoryPoint[] = activeTrajectoryStudent ? shownTrajectoryHistory.map((version) => ({ seatId: studentSeat(version.assignments, activeTrajectoryStudent) ?? "", round: version.round, at: versionDate(version) })).filter((point) => !!point.seatId && seatsOf(c).some((seat) => seat.id === point.seatId)) : [];
  const trajectoryFairnessIssues = trajectoryStudent ? fairnessIssues.filter((issue) => issue.studentIds.includes(trajectoryStudent)) : [];
  function renderStudentRules(student: Student) {
    const linked = c.rules.filter((rule) => rule.studentId === student.id || rule.targetId === student.id);
    return <div className="roster-rule-editor"><div className="roster-rule-heading"><strong>排座规则 · {linked.length} 条</strong><button className="button mini" onClick={() => { setRuleEditingStudent(ruleEditingStudent === student.id ? "" : student.id); setRuleStudent(student.id); setRuleTarget(""); }}>{ruleEditingStudent === student.id ? "收起规则表单" : "为这位学生添加规则"}</button></div>
      {linked.length > 0 && <div className="roster-rule-items">{linked.map((rule) => <div key={rule.id}><span><b>{ruleText(c, rule)}</b><small>{rule.priority === "must" ? "必须" : "尽量"} · {rule.scope === "always" ? "一直有效" : rule.scope === "round" ? "仅本轮" : `到 ${rule.until || "未设置日期"}`}{rule.note ? ` · ${rule.note}` : ""}</small></span><button className="button mini" onClick={() => commit((_, cl) => { const item = cl.rules.find((entry) => entry.id === rule.id); if (item) item.priority = item.priority === "must" ? "prefer" : "must"; })}>改为{rule.priority === "must" ? "尽量" : "必须"}</button><button className="icon-button" aria-label={`删除${ruleText(c, rule)}`} onClick={() => commit((_, cl) => { cl.rules = cl.rules.filter((entry) => entry.id !== rule.id); })}><X size={14} /></button></div>)}</div>}
      {ruleEditingStudent === student.id && <div className="roster-rule-form"><div className="segmented"><button className={ruleType === "need" ? "active" : ""} onClick={() => setRuleType("need")}>座位需求</button><button className={ruleType === "relation" ? "active" : ""} onClick={() => setRuleType("relation")}>学生关系</button></div><div className="roster-rule-fields">{ruleType === "need" ? <label>希望安排<select value={ruleNeed} onChange={(e) => setRuleNeed(e.target.value as SeatNeed)}>{needOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : <><label>另一位学生<select value={ruleTarget} onChange={(e) => setRuleTarget(e.target.value)}><option value="">选择学生</option>{c.students.filter((item) => item.id !== student.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>两人关系<select value={ruleRelation} onChange={(e) => setRuleRelation(e.target.value as RelationKind)}>{relationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></>}<label>重要程度<select value={rulePriority} onChange={(e) => setRulePriority(e.target.value as Priority)}><option value="must">必须</option><option value="prefer">尽量</option></select></label><label>持续时间<select value={ruleScope} onChange={(e) => setRuleScope(e.target.value as RuleScope)}><option value="always">一直有效</option><option value="round">仅本轮</option><option value="until">到指定日期</option></select></label>{ruleScope === "until" && <label>截止日期<input type="date" value={ruleUntil} onChange={(e) => setRuleUntil(e.target.value)} /></label>}<label className="wide">原因或备注<input value={ruleNote} onChange={(e) => setRuleNote(e.target.value)} placeholder="仅教师可见，可留空" /></label></div><button className="button primary mini" onClick={() => { setRuleStudent(student.id); if (addRule()) setRuleEditingStudent(""); }}>保存规则</button></div>}
    </div>;
  }

  if (onboardingStep) return (
    <main className="onboarding-shell">
      <div className="onboarding-brand"><span className="brand-mark"><BookOpen size={22} /></span><span><b>班级座位助手</b><small>为老师准备的排座工作台</small></span></div>
      <section className="onboarding-card">
        <div className="onboarding-progress" aria-label="初始化进度">
          {["班级", "名单", "教室"].map((label, index) => <span key={label} className={onboardingStep === "welcome" ? "" : index <= ["class", "students", "layout"].indexOf(onboardingStep) ? "active" : ""}><b>{index + 1}</b>{label}</span>)}
        </div>
        {onboardingStep === "welcome" && <>
          <span className="eyebrow">首次使用 · 约 2 分钟</span>
          <h1>先准备好你的班级</h1>
          <p>建立班级、加入学生、确认教室座位，然后就可以设置规则并生成排座方案。数据保存在这台设备的浏览器中。</p>
          <div className="onboarding-overview"><div><Users size={21} /><strong>导入名单</strong><small>粘贴姓名或读取 Excel / CSV</small></div><div><LayoutGrid size={21} /><strong>确认教室</strong><small>逐排调整单人和双人座位</small></div><div><Sparkles size={21} /><strong>开始排座</strong><small>比较方案，再由老师决定</small></div></div>
          <div className="onboarding-actions"><button className="button primary" onClick={() => setOnboardingStep("class")}>创建我的班级 <ArrowRight size={16} /></button><button className="button outline" onClick={() => finishOnboarding(false)}>先体验示例班级</button></div>
        </>}
        {onboardingStep === "class" && <>
          <span className="eyebrow">第 1 步 / 共 3 步</span><h1>给班级起个名字</h1><p>之后可以在顶部切换或新增班级。</p>
          <label className="onboarding-field">班级名称<input autoFocus value={classNameInput} onChange={(e) => { setClassNameInput(e.target.value); setImportError(""); }} onKeyDown={(e) => { if (e.key === "Enter") startOnboardingClass(); }} placeholder="例如：七年级 3 班" /></label>
          {importError && <p className="field-error">{importError}</p>}
          <div className="onboarding-actions"><button className="button primary" onClick={startOnboardingClass}>下一步：加入学生 <ArrowRight size={16} /></button><button className="button subtle" onClick={() => setOnboardingStep("welcome")}>返回</button></div>
        </>}
        {onboardingStep === "students" && <>
          <span className="eyebrow">第 2 步 / 共 3 步 · {c.name}</span><h1>加入学生名单</h1><p>每行一个姓名，也可以直接导入 Excel 或 CSV。名单还没准备好时可以跳过。</p>
          <label className="onboarding-field">粘贴名单<textarea value={pasteInput} onChange={(e) => { setPasteInput(e.target.value); setImportError(""); }} rows={7} placeholder={"王小明 男\n李晨 女\n张浩"} /></label>
          <label className="onboarding-upload"><Upload size={17} /> 从 Excel / CSV 导入<input type="file" accept=".xlsx,.csv" onChange={async (e) => { const okay = await importFile(e.target.files?.[0]); e.target.value = ""; if (okay) setOnboardingStep("layout"); }} /></label>
          {c.students.length > 0 && <p className="onboarding-success">已加入 {c.students.length} 名学生</p>}
          {importError && <p className="field-error">{importError}</p>}
          <div className="onboarding-actions"><button className="button primary" onClick={() => { if (c.students.length && !pasteInput.trim()) { setOnboardingStep("layout"); return; } if (addNames(parseNames(pasteInput))) setOnboardingStep("layout"); }}>加入并继续 <ArrowRight size={16} /></button><button className="button outline" onClick={() => setOnboardingStep("layout")}>稍后导入</button></div>
        </>}
        {onboardingStep === "layout" && <>
          <span className="eyebrow">第 3 步 / 共 3 步 · {c.name}</span><h1>确认教室容量</h1><p>先用常见双人桌布局起步。完成后会打开交互式教室编辑器，逐排调整桌型与停用座位。</p>
          <div className="onboarding-layout-fields"><label className="onboarding-field">排数<input type="number" min={1} max={12} value={c.layout.rows} onChange={(e) => updateLayout({ ...c.layout, rows: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })} /></label><label className="onboarding-field">每排双人桌数<input type="number" min={1} max={8} value={c.layout.desks} onChange={(e) => updateLayout({ ...c.layout, desks: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })} /></label></div>
          <div className={`onboarding-capacity ${seatsOf(c).length < c.students.length ? "short" : ""}`}><strong>{seatsOf(c).length} 个可用座位 · {c.students.length} 名学生</strong><span>{seatsOf(c).length < c.students.length ? `还差 ${c.students.length - seatsOf(c).length} 个座位，进入编辑器继续添加。` : "当前容量足够，可以继续细调教室。"}</span></div>
          <div className="onboarding-actions"><button className="button primary" onClick={() => finishOnboarding(true)}>完成，去编辑教室 <ArrowRight size={16} /></button><button className="button outline" onClick={() => finishOnboarding(false)}>直接进入座位页</button></div>
        </>}
      </section>
    </main>
  );

  const stage = view === "classroom" && !layoutMode;

  if (publicMode)
    return (
      <main className="projection" aria-label="学生投影视图">
        <header className="projection-header">
          <div>
            <span className="eyebrow">换座模式 · 学生视图</span>
            <h1>
              {c.name} <span>第 {c.round} 轮座位</span>
            </h1>
          </div>
          <div className="projection-actions">
            <button className="button ghost" onClick={() => setMoveStep(0)}>
              从头开始
            </button>
            <button
              className="button ghost"
              onClick={() => setPublicMode(false)}
            >
              <X size={18} /> 退出投影
            </button>
          </div>
        </header>
        <div className="projection-body">
          <SeatBoard
            c={publicClass}
            assignments={publicAssignment}
            publicMode
            doneRows={moveRows.slice(0, moveStep)}
          />
          <aside className="projection-guide">
            <h2>按排换座</h2>
            <p>
              每完成一步，再让下一排移动。发生互换时，请一人先暂时站到过道。
            </p>
            <div className="step-count">
              {Math.min(moveStep + 1, moveRows.length)}{" "}
              <small>/ {moveRows.length}</small>
            </div>
            <h3>
              {moveStep >= moveRows.length
                ? "全班换座完成"
                : `第 ${moveRows[moveStep] + 1} 排请移动`}
            </h3>
            <button
              className="button primary"
              onClick={() =>
                setMoveStep((x) => Math.min(x + 1, moveRows.length))
              }
              disabled={moveStep >= moveRows.length}
            >
              {moveStep >= moveRows.length ? "已完成" : "完成，下一步"}{" "}
              <ArrowRight size={18} />
            </button>
            <button
              className="button subtle"
              onClick={() => setMoveStep((x) => Math.max(0, x - 1))}
              disabled={!moveStep}
            >
              上一步
            </button>
          </aside>
        </div>
      </main>
    );

  return (
    <div className={`app ${stage ? "stage" : ""} ${managed ? "stage-managed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <BookOpen size={22} />
          </span>
          <div>
            <b>班级座位助手</b>
            <small>让每一次排座更科学</small>
          </div>
        </div>
        <nav aria-label="主导航">
          <button
            className={view === "classroom" ? "nav active" : "nav"}
            onClick={() => {
              setView("classroom");
              setPanel("none");
              setLayoutMode(false);
            }}
          >
            <LayoutGrid size={18} /> 当前座位
          </button>
          <button
            className={view === "roster" ? "nav active" : "nav"}
            onClick={() => { setView("roster"); setPanel("none"); setLayoutMode(false); }}
          >
            <Users size={18} /> 学生与规则
          </button>
          <button
            className={view === "history" ? "nav active" : "nav"}
            onClick={openHistory}
          >
            <History size={18} /> 历史版本
          </button>
          <button
            className={view === "trajectory" ? "nav active" : "nav"}
            onClick={() => { setView("trajectory"); setPanel("none"); setLayoutMode(false); setTrajectoryStudent(selected[0] ?? trajectoryStudent); }}
          >
            <ArrowDownUp size={18} /> 座位轮换
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="storage-status">
            <span className={`status-dot ${saveOkay ? "" : "danger"}`} />
            {saveOkay ? "已同步到云端" : "云端同步失败，请稍后再改一次"}
          </div>
          <button
            className="nav"
            onClick={() => {
              setPanel("backup");
              setImportError("");
            }}
          >
            <Download size={18} /> 备份数据
          </button>
          <button
            className="nav"
            onClick={() => {
              setView("layout"); setPanel("none"); setLayoutMode(true);
            }}
          >
            <Settings2 size={18} /> 编辑教室
          </button>
          <AccountMenu />
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="class-selector">
            <select
              aria-label="选择班级"
              value={c.id}
              onChange={(e) => {
                updateProject((p) => {
                  p.activeClassId = e.target.value;
                });
                setSelected([]);
                setPanel("none");
                setRosterChecked([]); setExpandedStudent(""); setTrajectoryStudent(""); setRuleEditingStudent("");
              }}
            >
              {project.classes.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <ChevronDown size={16} />
          </div>
          <button className="text-action" onClick={() => setPanel("newclass")}>
            <Plus size={16} /> 新建班级
          </button>
          <div className="topbar-round">{c.published ? `第 ${c.round} 轮正式版` : "尚无正式版"}</div>
          <span className="last-updated">{c.published ? `启用 ${lastVersion ? dateText(versionDate(lastVersion)) : dateText(c.publishedAt)}` : "工作草稿尚未发布"}</span>
          <div className="topbar-spacer" />
          <div className="searchbox">
            <Search size={18} />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索学生姓名、学号"
              aria-label="搜索学生"
            />
            {search && (
              <button aria-label="清除搜索" onClick={() => setSearch("")}>
                <X size={15} />
              </button>
            )}
          </div>
          <button
            className="icon-button top-icon"
            title="撤销 Ctrl+Z"
            disabled={!undoState.past.length}
            onClick={undo}
          >
            <RotateCcw size={18} />
          </button>
          <button
            className="icon-button top-icon"
            title="重做 Ctrl+Shift+Z"
            disabled={!undoState.future.length}
            onClick={redo}
          >
            <Redo2 size={18} />
          </button>
          <AccountMenu placement="bar" />
        </header>
        <nav className="mobile-nav" aria-label="移动端导航">
          <button className={view === "classroom" && panel === "none" ? "active" : ""} onClick={() => { setView("classroom"); setPanel("none"); setLayoutMode(false); }}><LayoutGrid size={16} />座位</button>
          <button className={view === "roster" ? "active" : ""} onClick={() => { setView("roster"); setPanel("none"); setLayoutMode(false); }}><Users size={16} />名单规则</button>
          <button className={view === "trajectory" ? "active" : ""} onClick={() => { setView("trajectory"); setPanel("none"); setLayoutMode(false); }}><ArrowDownUp size={16} />轮换</button>
          <button className={view === "layout" ? "active" : ""} onClick={() => { setView("layout"); setPanel("none"); setLayoutMode(true); }}><Settings2 size={16} />教室</button>
          <button className={view === "history" ? "active" : ""} onClick={openHistory}><History size={16} />历史</button>
          <button className={panel === "backup" ? "active" : ""} onClick={() => setPanel("backup")}><Download size={16} />备份</button>
        </nav>
        <main className={`workspace workspace-${view}`}>
          {view === "classroom" ? <>
          <div className="workspace-heading">
            <div>
              <span className="eyebrow">
                当前教室 <span className="eyebrow-line" />
              </span>
              <h1>
                {c.name} <span className="heading-sub">第 {draftRound} 轮工作草稿</span>
              </h1>
              <p>
                {c.students.length} 名学生 · {seatsOf(c).length} 个座位{" "}
                {draftChanged > 0 && c.published
                  ? `· 与已发布座位相比 ${draftChanged} 人调整`
                  : ""}
              </p>
              <div className="draft-status"><span className="status-chip draft">{hasDraftChanges ? "草稿 · 待发布" : "草稿 · 与正式版一致"}</span><span className="status-chip official">{c.published ? `正式使用 · 第 ${c.round} 轮 · ${lastVersion ? dateText(versionDate(lastVersion)) : dateText(c.publishedAt)}` : "尚无正式版"}</span></div>
            </div>
            <div className="heading-actions">
              <button
                className="button ghost"
                onClick={openHistory}
                disabled={!c.published || (!hasDraftChanges && c.versions.length < 2)}
              >
                <ArrowDownUp size={17} /> 对比上一版
              </button>
              <button
                className="button ghost"
                onClick={() => {
                  setPublicMode(true);
                  setMoveStep(0);
                }}
                disabled={!c.published}
              >
                <Maximize2 size={17} /> 投影视图
              </button>
              <button
                className="button ghost"
                onClick={() => setPanel("print")}
              >
                <Printer size={17} /> 打印
              </button>
            </div>
          </div>
          {c.pending && (
            <div className="notice positive">
              <Clock3 size={18} /> 第 {c.pending.round} 轮待启用 · {dateText(c.pending.effectiveDate || c.pending.at)}{c.pending.semesterWeek ? ` · 第 ${c.pending.semesterWeek} 周` : ""}{c.pending.note ? ` · ${c.pending.note}` : ""}
              <button onClick={activatePending}>现在开始使用</button>
            </div>
          )}
          {!saveOkay && (
            <div className="notice error">
              <CircleAlert size={18} /> 云端同步失败，改动还在这台设备上，请再试一次或先导出备份。
              <button onClick={exportBackup}>导出备份</button>
            </div>
          )}
          <div className="workspace-grid">
            <section className={`student-column ${pendingCount ? "has-unseated" : ""}`}>
              <div className="column-head">
                <b>学生{pendingCount ? ` · ${pendingCount} 人待安排` : ""}</b>
                <button onClick={() => { setView("roster"); setPanel("none"); }}>
                  管理 <ChevronRight size={14} />
                </button>
              </div>
              <div className="list-search-note">
                待安排学生可拖到空座位，或点击姓名后点击空位
              </div>
              <div className="student-list">
                {visibleStudents.map((s) => {
                  const seat = seatsOf(c).find(
                    (x) => x.id === studentSeat(c.assignments, s.id),
                  );
                  return (
                    <button
                      key={s.id}
                      className={`student-list-item ${!seat ? "unseated" : ""} ${selected.includes(s.id) ? "selected" : ""}`}
                      draggable={!seat && !c.locks.includes(s.id) && !previewingProposal}
                      onDragStart={(e) => {
                        if (seat) return;
                        e.dataTransfer.setData("text/plain", s.id);
                        e.dataTransfer.effectAllowed = "move";
                        setStudentDragImage(e, s);
                        setDragged(s.id);
                        setSelected([s.id]);
                        setSwapSource(undefined);
                      }}
                      onDragEnd={() => setDragged(undefined)}
                      onClick={(e) => {
                        if (!seat) {
                          setSelected([s.id]);
                          setSwapSource(s.id);
                          setToast(`${s.name}待安排：拖到空位，或点击一个空座位。`);
                          return;
                        }
                        setSwapSource(undefined);
                        if (e.ctrlKey || e.metaKey || e.shiftKey)
                          setSelected((prev) =>
                            prev.includes(s.id)
                              ? prev.filter((x) => x !== s.id)
                              : [...prev, s.id],
                          );
                        else setSelected([s.id]);
                      }}
                    >
                      <StudentAvatar student={s} />
                      <span>
                        {s.name}
                        <small>
                          {seat ? `第 ${seat.row + 1} 排` : "待安排 · 拖到空位"}
                        </small>
                      </span>
                      {c.locks.includes(s.id) && <LockKeyhole size={13} />}
                    </button>
                  );
                })}
                {!visibleStudents.length && (
                  <div className="list-empty">
                    {c.students.length
                      ? "没有找到学生"
                      : "还没有学生，先导入名单。"}
                  </div>
                )}
              </div>
              <button
                className="column-add"
                onClick={() => {
                  setPanel("import");
                  setImportError("");
                }}
              >
                <Plus size={16} /> 添加或导入学生
              </button>
            </section>
            <section className="board-column">
              {stage && (
                <div className="stage-bar">
                  <div className="stage-title">
                    <b>{c.name}</b>
                    <span>{c.published ? `第 ${c.round} 轮` : "工作草稿"}</span>
                    {(c.groups ?? []).map((group) => (
                      <i key={group.id} style={{ background: group.color }} title={group.name} />
                    ))}
                  </div>
                  <div className="stage-actions">
                    {managed ? (
                      <>
                        <button className="button ghost" onClick={() => openGenerate(false)}>帮我排</button>
                        <button className="button ghost" onClick={() => { setView("roster"); setPanel("none"); setLayoutMode(false); }}>名单与规则</button>
                        <button className="button ghost" onClick={() => { setView("history"); setPanel("none"); }}>历史</button>
                        <button className="button ghost" onClick={() => { setView("layout"); setPanel("none"); setLayoutMode(true); }}>教室</button>
                        <button className="button ghost" onClick={lockStage}><LockKeyhole size={16} /> 锁定</button>
                      </>
                    ) : (
                      <button className="button primary" onClick={() => void openManage()}>输入 PIN 管理</button>
                    )}
                    <AccountMenu placement="stage" />
                  </div>
                </div>
              )}
              <div className="board-toolbar">
                <div className="board-toolbar-left">
                  <span className="view-pill">
                    <LayoutGrid size={15} /> 教室视图
                  </span>
                  <span className="board-hint">从讲台看向学生</span>
                </div>
                <div className="board-toolbar-right">
                  <button
                    className="icon-button"
                    title="缩小"
                    onClick={() =>
                      setZoom((z) =>
                        Math.max(0.65, Math.round((z - 0.1) * 10) / 10),
                      )
                    }
                  >
                    <ZoomOut size={17} />
                  </button>
                  <span className="zoom-value">{Math.round(zoom * 100)}%</span>
                  <button
                    className="icon-button"
                    title="放大"
                    onClick={() =>
                      setZoom((z) =>
                        Math.min(1.35, Math.round((z + 0.1) * 10) / 10),
                      )
                    }
                  >
                    <ZoomIn size={17} />
                  </button>
                  <button className="text-action" onClick={() => setZoom(1)}>
                    适应
                  </button>
                  <button
                    className="icon-button"
                    title="教室设置"
                    onClick={() => {
                      setView("layout"); setPanel("none"); setLayoutMode(true);
                    }}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </div>
              </div>
              {c.students.length === 0 ? (
                <div className="empty-main">
                  <div className="empty-icon">
                    <Users size={30} />
                  </div>
                  <h2>先把学生带进来</h2>
                  <p>粘贴名单或导入 Excel，接着就能开始排座。</p>
                  <button
                    className="button primary"
                    onClick={() => setPanel("import")}
                  >
                    导入学生名单 <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <SeatBoard
                  c={c}
                  assignments={preview}
                  onSeat={previewingProposal ? undefined : selectSeat}
                  onDropStudent={previewingProposal ? undefined : swapTo}
                  selected={selected}
                  query={search}
                  layoutMode={layoutMode}
                  dragged={dragged}
                  setDragged={setDragged}
                  zoom={zoom}
                  previous={previewingProposal ? c.assignments : undefined}
                  highlightChanges={previewingProposal}
                  readOnly={previewingProposal || (stage && !managed)}
                  frozen={stage && !managed}
                  dragCohort={managed ? selected : []}
                  showScore={stage}
                  markEmpty={!stage || !!swapSource}
                  motion={seatMotion}
                />
              )}
              {stage && managed && selected.length > 0 && (
                <div className="seat-dock">
                  <b>{selected.length === 1 ? current?.name : `已选 ${selected.length} 人`}</b>
                  {selected.length === 1 && current && (
                    <span className="seat-dock-points">{current.points ?? 0} 分</span>
                  )}
                  {selected.length === 1 && current && (
                    <>
                      <button className="button mini" onClick={() => void awardPoints(current.id, -1)}>-1</button>
                      <button className="button mini" onClick={() => void awardPoints(current.id, 1)}>+1</button>
                      <button className="button mini" onClick={() => void awardPoints(current.id, 5)}>+5</button>
                    </>
                  )}
                  <select
                    aria-label="调整小组"
                    value={selected.length === 1 ? current?.groupId ?? "" : ""}
                    onChange={(event) => (event.target.value ? putInGroup(selected, event.target.value) : leaveGroup(selected))}
                  >
                    <option value="" disabled={selected.length > 1}>
                      {selected.length > 1 ? "加入小组" : "未分组"}
                    </option>
                    {(c.groups ?? []).map((group) => (
                      <option key={group.id} value={group.id}>{group.name}</option>
                    ))}
                    <option value="new">编成新的一组</option>
                  </select>
                  {selected.length === 1 && current?.groupId && (
                    <button className="button mini" onClick={() => setSelected(c.students.filter((student) => student.groupId === current.groupId).map((student) => student.id))}>
                      选中整组
                    </button>
                  )}
                  {selected.some((id) => c.students.find((student) => student.id === id)?.groupId) && (
                    <button className="button mini" onClick={() => leaveGroup(selected)}>移出小组</button>
                  )}
                  <span className="seat-dock-hint">{selected.length > 1 ? "拖动其中一人，整组一起移动" : "按住 Shift 再点其他同学，可以一起编组"}</span>
                </div>
              )}
              <div className="board-footer">
                <div className="legend">
                  <span>
                    <i className="legend-selected" /> 已选中
                  </span>
                  <span>
                    <LockKeyhole size={14} /> 已锁定
                  </span>
                  <span>
                    <i className="legend-rule" /> 有规则
                  </span>
                  <span>
                    <CircleAlert size={14} /> 需要关注
                  </span>
                  {previewingProposal && <span><i className="legend-moved" /> 本方案调整</span>}
                </div>
                <div className="board-footer-actions">
                  {selected.length > 0 && (
                    <>
                      <span className="selection-count">
                        已选 {selected.length} 人
                      </span>
                      <button className="button mini" onClick={toggleLocks}>
                        {selected.every((s) => c.locks.includes(s)) ? (
                          <UnlockKeyhole size={15} />
                        ) : (
                          <LockKeyhole size={15} />
                        )}{" "}
                        {selected.every((s) => c.locks.includes(s))
                          ? "解锁"
                          : "锁定"}
                      </button>
                      <button
                        className="button mini"
                        onClick={() => setSelected([])}
                      >
                        取消选择
                      </button>
                    </>
                  )}
                </div>
              </div>
            </section>
            <aside className="insights">
              {current ? (
                <>
                  <div className="insight-head">
                    <div>
                      <span className="eyebrow">学生座位</span>
                      <h2>{current.name}</h2>
                    </div>
                    <button
                      className="icon-button"
                      onClick={() => setSelected([])}
                      aria-label="关闭学生详情"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="selected-location">
                    {seatLabel(
                      seatsOf(c).find(
                        (s) => s.id === studentSeat(c.assignments, current.id),
                      ),
                    )}
                  </div>
                  <p className="muted">
                    上次：
                    {seatLabel(
                      seatsOf(c).find(
                        (s) =>
                          s.id ===
                          studentSeat(
                            lastVersion?.assignments ?? {},
                            current.id,
                          ),
                      ),
                    )}
                    <br />
                    同桌：
                    {studentName(c, partnerOf(c, c.assignments, current.id))}
                  </p>
                  {currentIssue && (
                    <div className="selected-conflict">
                      <strong>
                        <CircleAlert size={15} /> {currentIssue.message}
                      </strong>
                      <div>
                        <button onClick={repairSelected}>智能调整周边</button>
                        <button
                          onClick={() => {
                            if (currentIssue.ruleId)
                              commit((_, cl) => {
                                cl.ignoredRuleIds = Array.from(
                                  new Set([
                                    ...cl.ignoredRuleIds,
                                    currentIssue.ruleId!,
                                  ]),
                                );
                              });
                          }}
                        >
                          本次允许
                        </button>
                        <button onClick={() => { setView("roster"); setPanel("none"); setExpandedStudent(current.id); setRuleEditingStudent(current.id); setRuleStudent(current.id); }}>
                          修改规则
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="insight-divider" />
                  <h3>为什么在这里？</h3>
                  {(() => {
                    const x = explain(c, current.id);
                    return (
                      <div className="explanation">
                        {x.must.length > 0 && (
                          <>
                            <small>必须满足</small>
                            {x.must.map((t, i) => (
                              <p key={i}>{t}</p>
                            ))}
                          </>
                        )}
                        {x.prefer.length > 0 && (
                          <>
                            <small>尽量满足</small>
                            {x.prefer.map((t, i) => (
                              <p key={i}>{t}</p>
                            ))}
                          </>
                        )}
                        {x.context.map((t, i) => (
                          <p className="muted" key={i}>
                            · {t}
                          </p>
                        ))}
                      </div>
                    );
                  })()}
                  <div className="insight-divider" />
                  <div className="stack-actions">
                    <button className="button outline" onClick={toggleLocks}>
                      {c.locks.includes(current.id) ? (
                        <UnlockKeyhole size={16} />
                      ) : (
                        <LockKeyhole size={16} />
                      )}{" "}
                      {c.locks.includes(current.id) ? "解锁位置" : "锁定位置"}
                    </button>
                    <button
                      className="button outline"
                      onClick={() => {
                        setSwapSource(current.id);
                        setToast("请点击要交换的座位。");
                      }}
                    >
                      <ArrowDownUp size={16} /> 换座
                    </button>
                    <button className="button outline" onClick={openAdjust}>
                      <WandSparkles size={16} /> 帮我调一下
                    </button>
                  </div>
                  <div className="insight-divider" />
                  <h3>座位历史</h3>
                  {selectedHistory()
                    .slice(-3)
                    .reverse()
                    .map((x) => (
                      <p className="history-mini" key={x.version.id}>
                        第 {x.version.round} 轮 <span>{seatLabel(x.seat)}</span>
                      </p>
                    ))}
                  <details className="student-note">
                    <summary>教师备注</summary>
                    <textarea
                      key={current.id}
                      defaultValue={current.note ?? ""}
                      placeholder="仅教师视图可见"
                      onBlur={(e) => {
                        const note = e.target.value.trim();
                        if (note !== (current.note ?? ""))
                          commit((_, cl) => {
                            const student = cl.students.find(
                              (s) => s.id === current.id,
                            );
                            if (student) student.note = note;
                          });
                      }}
                    />
                  </details>
                </>
              ) : (
                <>
                  <div className="insight-head">
                    <div>
                      <span className="eyebrow">一眼看清</span>
                      <h2>当前提醒</h2>
                    </div>
                    <span className="count-badge">
                      {issues.length + fairnessIssues.length}
                    </span>
                  </div>
                  {issues.length || fairnessIssues.length ? (
                    <div className="issue-list">
                      {[...issues, ...fairnessIssues]
                        .slice(0, 4)
                        .map((issue) => (
                          <button
                            key={issue.id}
                            className={`issue ${issue.severity}`}
                            onClick={() => setSelected(issue.studentIds)}
                          >
                            <span className="issue-icon">
                              {issue.severity === "must" ? (
                                <CircleAlert size={16} />
                              ) : issue.severity === "prefer" ? (
                                <Sparkles size={16} />
                              ) : (
                                <ArrowDownUp size={16} />
                              )}
                            </span>
                            <span>
                              {issue.message}
                              <small>
                                {issue.severity === "must"
                                  ? "必要规则"
                                  : issue.severity === "prefer"
                                    ? "尽量满足"
                                    : "轮换提醒"}
                              </small>
                            </span>
                            <ChevronRight size={15} />
                          </button>
                        ))}
                    </div>
                  ) : (
                    <div className="all-good">
                      <CheckCircle2 size={20} />
                      <span>当前座位没有需要处理的问题</span>
                    </div>
                  )}
                  <button
                    className="side-link"
                    onClick={() => { setView("trajectory"); setTrajectoryStudent(selected[0] ?? trajectoryStudent); setPanel("none"); }}
                  >
                    查看轮换情况 <ChevronRight size={15} />
                  </button>
                  <div className="insight-divider" />
                  <div className="insight-head compact">
                    <h2>排座规则</h2>
                    <button onClick={() => { setView("roster"); setPanel("none"); }}>
                      管理规则 <ChevronRight size={14} />
                    </button>
                  </div>
                  <div className="rule-summary">
                    {active.slice(0, 3).map((r) => (
                      <div key={r.id}>
                        <span className={`rule-dot ${r.priority}`} />
                        <span>{ruleText(c, r)}</span>
                      </div>
                    ))}
                    {!active.length && (
                      <p>还没有设置规则。需要时再添加即可。</p>
                    )}
                  </div>
                  <button
                    className="column-add"
                    onClick={() => setPanel("rules")}
                  >
                    <Plus size={16} /> 添加排座规则
                  </button>
                  <div className="insight-divider" />
                  <div className="class-summary">
                    <span>班级概况</span>
                    <strong>
                      {c.students.length} <small>名学生</small>
                    </strong>
                    <p>
                      {c.locks.length} 人锁定 · {c.layout.rows} 排 ·{" "}
                      {Math.max(...Array.from({ length: c.layout.rows }, (_, row) => rowPattern(c.layout, row).length))} 组桌最多
                    </p>
                  </div>
                  <div className="insight-art"><img src={deskIllustration} alt="书桌与小黑板插画" loading="lazy" /><span>每一次调整，都有迹可循</span></div>
                </>
              )}
            </aside>
          </div>
          <div className="bottom-actions">
            <button
              className="button primary large"
              onClick={() => openGenerate(false)}
              disabled={
                !c.students.length || seatsOf(c).length < c.students.length
              }
            >
              <Sparkles size={20} />
              <span>
                帮我排<small>生成可比较的方案</small>
              </span>
            </button>
            <button
              className="button secondary large"
              onClick={openAdjust}
              disabled={!selected.length}
            >
              <WandSparkles size={19} />
              <span>
                帮我调一下<small>只调整局部座位</small>
              </span>
            </button>
            <button
              className="button secondary large"
              onClick={() => openGenerate(true)}
              disabled={
                !c.students.length || seatsOf(c).length < c.students.length
              }
            >
              <RotateCcw size={19} />
              <span>
                下一轮<small>优先公平轮换</small>
              </span>
            </button>
            <button
              className="button secondary large publish-action"
              onClick={() => setPanel("publish")}
              disabled={!c.students.length}
            >
              <ArrowRight size={19} />
              <span>
                发布座位<small>检查后正式使用</small>
              </span>
            </button>
          </div>
          {seatsOf(c).length < c.students.length && (
            <div className="capacity-warning">
              <CircleAlert size={16} /> 当前少{" "}
              {c.students.length - seatsOf(c).length} 个座位。
              <button
                onClick={() => {
                  setView("layout"); setPanel("none"); setLayoutMode(true);
                }}
              >
                调整教室
              </button>
            </div>
          )}
          </> : view === "layout" ? <>
            <div className="page-heading"><div><span className="eyebrow">教室布局</span><h1>编辑教室</h1><p>只编辑座位结构。按排调整桌型，或一次为每排新增一组。</p></div><button className="button primary" onClick={() => { setView("classroom"); setLayoutMode(false); }}>完成编辑 <Check size={16} /></button></div>
            <div className="layout-editor-grid">
              <section className="layout-canvas"><div className="board-toolbar"><b>教室预览</b><span className={`layout-capacity ${seatsOf(c).length < c.students.length ? "short" : "enough"}`}>{seatsOf(c).length} 个可用座位 / {c.students.length} 名学生 · {seatsOf(c).length < c.students.length ? `还差 ${c.students.length - seatsOf(c).length} 座` : `座位足够${seatsOf(c).length > c.students.length ? `，余 ${seatsOf(c).length - c.students.length} 座` : ""}`}</span></div><SeatBoard c={c} assignments={{}} layoutMode onSeat={selectSeat} /><p className="muted">点击座位可停用或重新启用。移除的座位不会出现在排座画布中；已安排的学生会转为待安排，可撤销。</p></section>
              <section className="layout-controls"><div className="layout-controls-head"><div className="layout-controls-title"><h2>逐排编辑</h2><button className="button outline" onClick={addRow} disabled={c.layout.rows >= 12}><Plus size={15} /> 加一排</button></div><div className="layout-bulk-actions"><span>批量添加到每排末尾</span><button className="button mini" onClick={() => addColumn(1)} disabled={Array.from({ length: c.layout.rows }, (_, row) => rowPattern(c.layout, row).length).some((length) => length >= 8)}><Plus size={14} /> 单人座列</button><button className="button mini" onClick={() => addColumn(2)} disabled={Array.from({ length: c.layout.rows }, (_, row) => rowPattern(c.layout, row).length).some((length) => length >= 8)}><Plus size={14} /> 双人桌列</button></div></div>
                {Array.from({ length: c.layout.rows }, (_, row) => <div className="layout-row-card" key={row}><div className="layout-row-head"><strong>第 {row + 1} 排</strong><span>{rowPattern(c.layout, row).reduce((sum, capacity) => sum + capacity, 0)} 个座位</span><button className="icon-button" title={`删除第 ${row + 1} 排`} onClick={() => removeRow(row)} disabled={c.layout.rows <= 1}><X size={15} /></button></div><div className="layout-desk-list">{rowPattern(c.layout, row).map((capacity, desk) => <button key={desk} className={`layout-desk-choice ${capacity === 1 ? "single" : ""}`} title={`第 ${desk + 1} 组，点击切换单人桌或双人桌`} onClick={() => editRow(row, (pattern) => pattern.map((value, index) => index === desk ? value === 1 ? 2 : 1 : value))}><span>{desk + 1}</span><b>{capacity === 1 ? "单人" : "双人"}</b></button>)}</div><div className="layout-row-actions"><button className="button mini" onClick={() => editRow(row, (pattern) => [...pattern, 2])} disabled={rowPattern(c.layout, row).length >= 8}><Plus size={14} /> 加双人桌</button><button className="button mini" onClick={() => editRow(row, (pattern) => [...pattern, 1])} disabled={rowPattern(c.layout, row).length >= 8}><Plus size={14} /> 加单人桌</button><button className="button mini" onClick={() => editRow(row, (pattern) => pattern.slice(0, -1))} disabled={rowPattern(c.layout, row).length <= 1}>移除末桌</button></div></div>)}
                <div className="layout-sides"><label>窗在<select value={c.layout.windowSide} onChange={(e) => updateLayout({ ...c.layout, windowSide: e.target.value as "left" | "right" })}><option value="left">左侧</option><option value="right">右侧</option></select></label><label>门在<select value={c.layout.doorSide} onChange={(e) => updateLayout({ ...c.layout, doorSide: e.target.value as "left" | "right" })}><option value="left">左侧</option><option value="right">右侧</option></select></label></div>
              </section>
            </div>
          </> : view === "roster" ? <>
            <div className="page-heading"><div><span className="eyebrow">班级资料</span><h1>学生与规则</h1><p>{c.students.length} 名学生 · {c.rules.length} 条排座规则 · 点击学生可查看轨迹和编辑规则</p></div><div className="page-actions"><button className="button outline" onClick={() => setPanel("import")}><Upload size={16} /> 导入名单</button><button className="button primary" onClick={() => { setPanel("import"); setImportError(""); }}><Plus size={16} /> 添加学生</button></div></div>
            <div className="roster-layout"><section className="roster-card"><div className="roster-toolbar"><label><input type="checkbox" aria-label="全选筛选结果" checked={visibleStudents.length > 0 && visibleStudents.every((student) => rosterChecked.includes(student.id))} onChange={(e) => setRosterChecked(e.target.checked ? Array.from(new Set([...rosterChecked, ...visibleStudents.map((student) => student.id)])) : rosterChecked.filter((sid) => !visibleStudents.some((student) => student.id === sid)))} /> 全选当前列表</label><span>已选 {rosterChecked.length} 人</span><button className="button mini danger" disabled={!rosterChecked.length} onClick={() => removeStudents(rosterChecked)}>批量删除</button></div><div className="roster-table-head"><span>学生</span><span>当前座位</span><span>排座规则</span><span>学生关系</span><span /></div><div className="roster-rows">{visibleStudents.map((student) => { const studentRules = active.filter((rule) => rule.studentId === student.id || rule.targetId === student.id); const needs = studentRules.filter((rule) => rule.type === "need"); const relations = studentRules.filter((rule) => rule.type === "relation"); const seat = seatsOf(c).find((item) => item.id === studentSeat(c.assignments, student.id)); const open = expandedStudent === student.id; return <div className={`roster-row-wrap ${open ? "open" : ""}`} key={student.id}><div className="roster-row"><input type="checkbox" aria-label={`选择${student.name}`} checked={rosterChecked.includes(student.id)} onChange={(e) => setRosterChecked((before) => e.target.checked ? [...before, student.id] : before.filter((sid) => sid !== student.id))} /><button className="roster-person" onClick={() => setExpandedStudent(open ? "" : student.id)}><StudentAvatar student={student} /><span><b>{student.name}</b><small>{student.gender === "boy" ? "男生" : student.gender === "girl" ? "女生" : "性别未标注"}{student.number ? ` · 学号 ${student.number}` : ""}</small></span></button><span className="roster-seat">{seatLabel(seat)}</span><span className="roster-tags">{needs.length ? needs.map((rule) => <small key={rule.id} className={rule.priority}>{needText[rule.need ?? ""]}</small>) : <small>无座位要求</small>}</span><span className="roster-tags">{relations.length ? relations.map((rule) => <small key={rule.id} className={rule.priority}>{studentName(c, rule.studentId === student.id ? rule.targetId : rule.studentId)} · {relationText[rule.relation ?? ""]}</small>) : <small>无关系规则</small>}</span><button className="icon-button" aria-label={`展开${student.name}轨迹`} onClick={() => setExpandedStudent(open ? "" : student.id)}>{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button></div>{open && <div className="roster-expanded"><div><strong>座位轮换轨迹</strong><p>{c.versions.length ? "右侧教室图已标出历轮座位与移动方向。" : "发布第一轮座位后会记录轨迹。"}</p></div><div className="roster-timeline">{c.versions.map((version) => { const seatId = studentSeat(version.assignments, student.id); const oldClass = { ...c, layout: version.layout ?? c.layout }; const place = seatsOf(oldClass).find((item) => item.id === seatId); return <span key={version.id}>第 {version.round} 轮 · {dateText(versionDate(version))} · {seatLabel(place)}</span>; })}</div><div className="student-appearance"><strong>学生标识</strong><label>性别<select aria-label={`${student.name}的性别`} value={student.gender ?? ""} onChange={(e) => commit((_, cl) => { const item = cl.students.find((entry) => entry.id === student.id); if (item) item.gender = (e.target.value || undefined) as Gender | undefined; })}><option value="">未标注</option><option value="boy">男生</option><option value="girl">女生</option></select></label><label className="student-glasses"><input type="checkbox" checked={!!student.glasses} disabled={!student.gender} onChange={(e) => commit((_, cl) => { const item = cl.students.find((entry) => entry.id === student.id); if (item) item.glasses = e.target.checked; })} /> 戴眼镜</label></div>{renderStudentRules(student)}<div className="roster-inline-actions"><button className="button mini" onClick={() => { setEditingStudent(student.id); setEditingName(student.name); }}>改名</button><button className="button mini" onClick={() => { setView("trajectory"); setTrajectoryStudent(student.id); }}>查看完整轨迹</button><button className="button mini danger" onClick={() => removeStudents([student.id])}>删除</button></div>{editingStudent === student.id && <div className="inline-input"><input value={editingName} onChange={(e) => setEditingName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") renameStudent(student.id); }} /><button className="button primary" onClick={() => renameStudent(student.id)}>保存姓名</button></div>}</div>}</div>; })}{!visibleStudents.length && <p className="muted">没有找到学生，可从上方导入名单。</p>}</div></section><aside className="roster-map"><div className="roster-map-head"><div><h2>{expandedStudent ? `${studentName(c, expandedStudent)}的座位轨迹` : "选择学生查看轨迹"}</h2><p>序号按发布时间排列，箭头指向下一轮。</p></div></div><div className="trajectory-filters"><label>显示<select value={trajectoryLimit} onChange={(e) => setTrajectoryLimit(e.target.value as "3" | "5" | "all")}><option value="3">最近 3 轮</option><option value="5">最近 5 轮</option><option value="all">全部轮次</option></select></label></div><SeatBoard c={c} assignments={c.assignments} trajectory={trajectoryPoints} focusStudentId={expandedStudent} selected={expandedStudent ? [expandedStudent] : []} readOnly /><p className="muted">历史教室中已移除的座位无法在当前教室图定位，仍可在左侧文字轨迹中查看。</p></aside></div>
          </> : view === "history" ? <>
            <div className="page-heading"><div><span className="eyebrow">版本管理</span><h1>历史座位对比</h1><p>左、右各选一个版本。蓝色桌椅表示学生的位置发生了变化；复制历史版只更新工作草稿，正式版不变。</p></div></div>
            <div className="history-toolbar"><label>左侧版本<select aria-label="左侧版本" value={historyOptions.some((option) => option.value === historyLeft) ? historyLeft : "draft"} onChange={(e) => setHistoryLeft(e.target.value)}>{historyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><button className="button outline" onClick={() => { setHistoryLeft(historyRight); setHistoryRight(historyLeft); }}><ArrowDownUp size={15} /> 交换左右</button><label>右侧版本<select aria-label="右侧版本" value={historyOptions.some((option) => option.value === historyRight) ? historyRight : "draft"} onChange={(e) => setHistoryRight(e.target.value)}>{historyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
            <ComparisonBoards left={snapshotFor(historyLeft)} right={snapshotFor(historyRight)} />
            <section className="history-list"><div className="history-list-head"><h2>已发布版本</h2><span>{c.versions.length} 条历史记录 · 当前草稿{hasDraftChanges ? "有待发布改动" : "与正式版一致"}</span></div>{c.versions.slice().reverse().map((version) => <div className="version-card" key={version.id}><div><strong>第 {version.round} 轮 {version.id === lastVersion?.id && <span className="status-chip official">当前正式版</span>}</strong><small>启用 {dateText(versionDate(version))}{version.semesterWeek ? ` · 第 ${version.semesterWeek} 周` : ""}</small></div>{version.note && <p>备注：{version.note}</p>}<div className="version-actions"><button className="button mini" onClick={() => setHistoryLeft(version.id === lastVersion?.id ? "published" : version.id)}>放在左侧</button><button className="button mini" onClick={() => setHistoryRight(version.id === lastVersion?.id ? "published" : version.id)}>放在右侧</button><button className="button outline mini" disabled={versionMatchesDraft(version)} onClick={() => restoreVersion(version)}>{versionMatchesDraft(version) ? "草稿已相同" : "复制到草稿"}</button><button className="button mini danger delete-version" aria-label={`删除第 ${version.round} 轮记录`} onClick={() => deleteVersion(version)}><Trash2 size={14} /> 删除记录</button></div></div>)}{!c.versions.length && <p className="muted">暂无历史记录。当前正式座位仍可继续使用。</p>}</section>
          </> : <>
            <div className="page-heading"><div><span className="eyebrow">历史对照</span><h1>座位轮换轨迹</h1><p>在教室图上按时间查看学生的座位变化；序号和箭头表示先后顺序。</p></div></div>
            <div className="trajectory-page"><div className="trajectory-page-toolbar"><label>学生<select value={trajectoryStudent} onChange={(e) => setTrajectoryStudent(e.target.value)}><option value="">选择学生</option>{c.students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label><label>显示轮次<select value={trajectoryLimit} onChange={(e) => setTrajectoryLimit(e.target.value as "3" | "5" | "all")}><option value="3">最近 3 轮</option><option value="5">最近 5 轮</option><option value="all">全部轮次</option></select></label><label>开始日期<input type="date" value={trajectoryFrom} onChange={(e) => setTrajectoryFrom(e.target.value)} /></label><label>结束日期<input type="date" value={trajectoryTo} onChange={(e) => setTrajectoryTo(e.target.value)} /></label></div><div className="trajectory-page-grid"><SeatBoard c={c} assignments={c.assignments} trajectory={trajectoryPoints} focusStudentId={trajectoryStudent} selected={trajectoryStudent ? [trajectoryStudent] : []} readOnly /><aside className="trajectory-history"><h2>{trajectoryStudent ? `${studentName(c, trajectoryStudent)} · 轮换记录` : "选择一名学生"}</h2>{trajectoryStudent && shownTrajectoryHistory.map((version, index) => { const oldClass = { ...c, layout: version.layout ?? c.layout }; const place = seatsOf(oldClass).find((seat) => seat.id === studentSeat(version.assignments, trajectoryStudent)); return <div key={version.id}><b>{index + 1}</b><span>第 {version.round} 轮<small>{dateText(versionDate(version))}</small><strong>{seatLabel(place)}</strong></span></div>; })}{trajectoryStudent && !shownTrajectoryHistory.length && <p>当前时间范围暂无历史记录。</p>}<div className="insight-divider" /><h3>轮换提醒</h3>{trajectoryFairnessIssues.length ? trajectoryFairnessIssues.map((issue) => <p key={issue.id} className="issue info">{issue.message}</p>) : <p className="muted">暂无连续位置或同桌重复提醒。</p>}</aside></div></div>
          </>}
        </main>
      </div>
      {pinAsk && (
        <PinDialog
          title={pinAsk === "set" ? "设置 PIN" : pinAsk === "change" ? "修改 PIN" : "进入管理"}
          confirmNew={pinAsk !== "verify"}
          askCurrent={pinAsk === "change"}
          onClose={() => setPinAsk("")}
          onSubmit={async (pin, currentPin) => {
            try {
              if (pinAsk === "set") await setPin(pin);
              else if (pinAsk === "change") await changePin(currentPin ?? "", pin);
              else if (!(await verifyPin(pin))) return "PIN 不正确";
              if (pinAsk !== "change") {
                setManaged(true);
                setView("classroom");
                setPanel("none");
                setLayoutMode(false);
              }
              setPinAsk("");
              return "";
            } catch (error) {
              return error instanceof Error ? error.message : "没有成功";
            }
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button onClick={undo} disabled={!undoState.past.length}>
            撤销
          </button>
          <button onClick={() => setToast("")} aria-label="关闭提示">
            <X size={15} />
          </button>
        </div>
      )}
      {panel !== "none" && (
        <div
          className={`panel-scrim ${previewingProposal ? "preview-scrim" : ""}`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setPanel("none");
              setLayoutMode(false);
            }
          }}
        >
          <section
            className={`drawer ${panel === "generate" ? "wide" : ""} ${previewingProposal ? "results" : ""}`}
            aria-label="操作面板"
          >
            <div className="drawer-header">
              <div>
                <span className="eyebrow">{c.name}</span>
                <h2>
                  {
                    (
                      {
                        rules: "排座规则",
                        import: "导入学生",
                        generate: "帮我排",
                        publish: "发布座位",
                        print: "打印座位表",
                        newclass: "新建班级",
                        adjust: "帮我调一下",
                        backup: "备份数据",
                      } as Record<string, string>
                    )[panel]
                  }
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => {
                  setPanel("none");
                  setLayoutMode(false);
                }}
                aria-label="关闭面板"
              >
                <X size={20} />
              </button>
            </div>
            <div className="drawer-body">
              {panel === "newclass" && (
                <>
                  <p className="muted">
                    先给班级起一个名字，随后导入学生名单。
                  </p>
                  <label className="field">
                    班级名称
                    <input
                      value={classNameInput}
                      onChange={(e) => setClassNameInput(e.target.value)}
                      placeholder="如：七年级 4 班"
                    />
                  </label>
                  <button
                    className="button primary full"
                    disabled={!classNameInput.trim()}
                    onClick={() => {
                      const name = classNameInput.trim();
                      commit((p) => {
                        const cl = makeEmptyClass(name);
                        p.classes.push(cl);
                        p.activeClassId = cl.id;
                      });
                      setClassNameInput("");
                      setSelected([]);
                      setPanel("import");
                    }}
                  >
                    创建并导入学生 <ArrowRight size={16} />
                  </button>
                </>
              )}
              {panel === "import" && (
                <>
                  <div className="callout">
                    <FileSpreadsheet size={19} />
                    <div>
                      <strong>把学生带进来</strong>
                      <p>可导入含“姓名、性别”列的 Excel / CSV，或粘贴每行一个姓名及可选性别。</p>
                    </div>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.csv"
                    hidden
                    onChange={(e) => {
                      importFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <button
                    className="button outline full"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload size={17} /> 选择 Excel 或 CSV 文件
                  </button>
                  <div className="divider-word">或者粘贴名单</div>
                  <label className="field">
                    学生名单
                    <textarea
                      rows={8}
                      value={pasteInput}
                      onChange={(e) => setPasteInput(e.target.value)}
                      placeholder={"王小明 男\n李晨 女\n张浩"}
                    />
                  </label>
                  <button
                    className="button primary full"
                    onClick={() => addNames(parseNames(pasteInput))}
                  >
                    导入名单 <ArrowRight size={16} />
                  </button>
                  {importError && <p className="field-error">{importError}</p>}
                </>
              )}
              {panel === "rules" && (
                <>
                  <p className="muted">
                    只记录排座需要的信息。原因仅在教师视图显示。
                  </p>
                  <div className="segmented">
                    <button
                      className={ruleType === "need" ? "active" : ""}
                      onClick={() => setRuleType("need")}
                    >
                      座位需求
                    </button>
                    <button
                      className={ruleType === "relation" ? "active" : ""}
                      onClick={() => setRuleType("relation")}
                    >
                      学生关系
                    </button>
                  </div>
                  <label className="field">
                    学生
                    <select
                      value={ruleStudent}
                      onChange={(e) => setRuleStudent(e.target.value)}
                    >
                      <option value="">选择学生</option>
                      {c.students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {ruleType === "need" ? (
                    <label className="field">
                      希望安排
                      <select
                        value={ruleNeed}
                        onChange={(e) =>
                          setRuleNeed(e.target.value as SeatNeed)
                        }
                      >
                        {needOptions.map((x) => (
                          <option value={x.value} key={x.value}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <>
                      <label className="field">
                        另一位学生
                        <select
                          value={ruleTarget}
                          onChange={(e) => setRuleTarget(e.target.value)}
                        >
                          <option value="">选择学生</option>
                          {c.students
                            .filter((s) => s.id !== ruleStudent)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="field">
                        两人关系
                        <select
                          value={ruleRelation}
                          onChange={(e) =>
                            setRuleRelation(e.target.value as RelationKind)
                          }
                        >
                          {relationOptions.map((x) => (
                            <option value={x.value} key={x.value}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  <div className="two-fields">
                    <label className="field">
                      重要程度
                      <select
                        value={rulePriority}
                        onChange={(e) =>
                          setRulePriority(e.target.value as Priority)
                        }
                      >
                        <option value="must">必须</option>
                        <option value="prefer">尽量</option>
                      </select>
                    </label>
                    <label className="field">
                      持续时间
                      <select
                        value={ruleScope}
                        onChange={(e) =>
                          setRuleScope(e.target.value as RuleScope)
                        }
                      >
                        <option value="always">一直有效</option>
                        <option value="round">仅本轮</option>
                        <option value="until">到指定日期</option>
                      </select>
                    </label>
                  </div>
                  {ruleScope === "until" && (
                    <label className="field">
                      截止日期
                      <input
                        type="date"
                        value={ruleUntil}
                        onChange={(e) => setRuleUntil(e.target.value)}
                      />
                    </label>
                  )}
                  <label className="field">
                    原因或备注（仅教师可见）
                    <input
                      value={ruleNote}
                      onChange={(e) => setRuleNote(e.target.value)}
                      placeholder="可留空"
                    />
                  </label>
                  <button className="button primary full" onClick={addRule}>
                    <Plus size={16} /> 添加规则
                  </button>
                  <div className="drawer-section-title">
                    已设置 · {c.rules.length} 条
                  </div>
                  <div className="rule-list">
                    {c.rules.map((r) => (
                      <div className="rule-row" key={r.id}>
                        <span className={`rule-dot ${r.priority}`} />
                        <div>
                          <strong>{ruleText(c, r)}</strong>
                          <small>
                            {r.priority === "must" ? "必须" : "尽量"} ·{" "}
                            {r.scope === "always"
                              ? "一直有效"
                              : r.scope === "round"
                                ? "仅本轮"
                                : `到 ${r.until || "未设置日期"}`}
                          </small>
                          {r.note && <small>教师备注：{r.note}</small>}
                        </div>
                        <button
                          className="icon-button"
                          aria-label="删除规则"
                          title="删除规则，可撤销"
                          onClick={() =>
                            commit((_, cl) => {
                              cl.rules = cl.rules.filter((x) => x.id !== r.id);
                            })
                          }
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                    {!c.rules.length && (
                      <p className="muted">
                        尚无规则。可以先排座，之后再补充。
                      </p>
                    )}
                  </div>
                </>
              )}
              {panel === "generate" && (
                <>
                  {generateStep === "goal" && (
                    <>
                      <h3>这次你主要想解决什么？</h3>
                      <p className="muted">
                        先选一个最重要的目标，系统会自动读取已设置的规则。
                      </p>
                      <div className="goal-grid">
                        {goalOptions.map((opt) => {
                          const Icon = opt.icon;
                          return (
                            <button
                              className={`goal-card ${goal === opt.id ? "selected" : ""}`}
                              key={opt.id}
                              onClick={() => setGoal(opt.id)}
                            >
                              <span className="goal-icon">
                                <Icon size={20} />
                              </span>
                              <strong>{opt.title}</strong>
                              <small>{opt.detail}</small>
                              {goal === opt.id && (
                                <CheckCircle2
                                  className="goal-check"
                                  size={18}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        className="button primary full"
                        onClick={() => setGenerateStep("review")}
                      >
                        下一步：确认规则 <ArrowRight size={16} />
                      </button>
                    </>
                  )}
                  {generateStep === "review" && (
                    <>
                      <div className="callout"><Sparkles size={18} /><div><strong>“帮我排”如何工作？</strong><p>先固定锁定座位并检查必要规则，再按本次目标尝试多次座位交换，比较规则、轮换和同桌情况。同一份数据会得到可复现的结果。未选择同桌性别偏好时，另附两种按列轮换的规律方案。</p></div></div>
                      <h3>我会遵守这些要求</h3>
                      <div className="review-list">
                        <p>
                          <Check size={16} /> 保留 {c.locks.length} 个已锁定位置
                        </p>
                        <p>
                          <Check size={16} /> 保留 {c.protectedIds.length}{" "}
                          个刚刚手工调整的位置
                        </p>
                        {active
                          .filter((r) => r.priority === "must")
                          .slice(0, 8)
                          .map((r) => (
                            <p key={r.id}>
                              <Check size={16} /> {ruleText(c, r)}
                            </p>
                          ))}
                        <p>
                          <Sparkles size={16} /> 本次目标：
                          {goalOptions.find((x) => x.id === goal)?.title}
                        </p>
                      </div>
                      <label className="field gender-preference">
                        同桌性别偏好（可选）
                        <select value={genderPreference} onChange={(e) => setGenderPreference(e.target.value as GenderPreference)}>
                          <option value="any">不考虑</option>
                          <option value="same">尽量同性同桌</option>
                          <option value="different">尽量异性同桌</option>
                        </select>
                        <small>仅对已标注性别的学生起作用；这是偏好，必要规则和锁定位置优先。</small>
                      </label>
                      <label className="field">
                        也可以直接告诉我你的想法
                        <textarea
                          rows={3}
                          value={intent}
                          onChange={(e) => {
                            setIntent(e.target.value);
                            setIntentConfirmed(false);
                          }}
                          placeholder="例如：王晨和李浩分开，陈晨不动"
                        />
                      </label>
                      {intent && (
                        <div className="intent-review">
                          <strong>我理解为：</strong>
                          {suggestion.messages.length ? (
                            suggestion.messages.map((m, i) => (
                              <p key={i}>✓ {m}</p>
                            ))
                          ) : (
                            <p>
                              暂时没有识别出可执行要求，请用学生姓名和“分开 /
                              不动 / 前三排”等表达。
                            </p>
                          )}
                          <label>
                            <input
                              type="checkbox"
                              checked={intentConfirmed}
                              onChange={(e) =>
                                setIntentConfirmed(e.target.checked)
                              }
                            />{" "}
                            确认采用上述可执行要求
                          </label>
                        </div>
                      )}
                      <div className="drawer-footer-row">
                        <button
                          className="button outline"
                          onClick={() => setGenerateStep("goal")}
                        >
                          <ArrowLeft size={16} /> 上一步
                        </button>
                        <button
                          className="button primary"
                          disabled={
                            generating ||
                            (!!intent &&
                              suggestion.rules.length +
                                suggestion.locks.length >
                                0 &&
                              !intentConfirmed)
                          }
                          onClick={runGenerate}
                        >
                          {generating ? "正在寻找合适方案…" : "生成方案"}{" "}
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    </>
                  )}
                  {generateStep === "results" && (
                    <>
                      <h3>选一个适合这次的方案</h3>
                      <p className="muted">
                        点选方案后，对照左右两张教室图。蓝色桌椅标出座位有变化的学生。{genderPreference === "any" ? "规律方案会说明必要规则修正。" : "本轮方案已考虑所选同桌性别偏好。"}
                      </p>
                      <div className="proposal-switcher" aria-label="选择对比方案">{proposals.map((proposal, index) => <button key={proposal.id} className={proposalIndex === index ? "active" : ""} onClick={() => setProposalIndex(index)}>{proposal.label}<small>{proposal.changed} 人调整</small></button>)}</div>
                      {proposals[proposalIndex] && <ComparisonBoards left={{ label: "当前工作草稿", c, assignments: c.assignments }} right={{ label: proposals[proposalIndex].label, c, assignments: proposals[proposalIndex].assignments, meta: proposals[proposalIndex].description }} />}
                      <div className="proposals">
                        {proposals.map((p, i) => (
                          <button
                            className={`proposal ${proposalIndex === i ? "selected" : ""}`}
                            key={p.id}
                            onClick={() => setProposalIndex(i)}
                          >
                            <div>
                              <strong>{p.label} <small className="proposal-kind">{p.kind === "pattern" ? "规律轮换" : "智能优化"}</small></strong>
                              <span>
                                {proposalIndex === i && (
                                  <CheckCircle2 size={18} />
                                )}
                              </span>
                            </div>
                            <p>{p.description}</p>
                            {proposalIndex === i && <p className="proposal-method">{p.method}</p>}
                            <small>
                              {p.changed} 人调整 · {p.newPartners} 人尝试新同桌
                            </small>
                            <small
                              className={
                                p.issues.some((x) => x.severity === "must")
                                  ? "issue-text"
                                  : ""
                              }
                            >
                              {p.issues.some((x) => x.severity === "must")
                                ? `${p.issues.filter((x) => x.severity === "must").length} 条必要规则未满足`
                                : "必要规则已满足"}
                            </small>
                          </button>
                        ))}
                      </div>
                      {proposals[proposalIndex]?.issues.some(
                        (i) => i.severity === "must",
                      ) && (
                        <div className="conflict-box">
                          <strong>这些要求暂时无法同时满足</strong>
                          {proposals[proposalIndex].issues
                            .filter((i) => i.severity === "must")
                            .slice(0, 4)
                            .map((i) => (
                              <p key={i.id}>· {i.message}</p>
                            ))}
                          <div className="conflict-actions">
                            <button
                              className="button outline"
                              onClick={() => {
                                const first = proposals[
                                  proposalIndex
                                ].issues.find((i) => i.ruleId);
                                if (!first?.ruleId) return;
                                commit((_, cl) => {
                                  const rule = cl.rules.find(
                                    (r) => r.id === first.ruleId,
                                  );
                                  if (rule) rule.priority = "prefer";
                                });
                                setGenerateStep("review");
                                setToast(
                                  "已将一条规则改为“尽量”，可重新生成。",
                                );
                              }}
                            >
                              将首条规则改为尽量
                            </button>
                            <button
                              className="button outline"
                              onClick={() => {
                                const first = proposals[
                                  proposalIndex
                                ].issues.find((i) => i.ruleId);
                                if (!first?.ruleId) return;
                                commit((_, cl) => {
                                  cl.ignoredRuleIds.push(first.ruleId!);
                                });
                                setGenerateStep("review");
                                setToast("本轮暂不执行这条规则，可重新生成。");
                              }}
                            >
                              本轮暂不执行
                            </button>
                            <button
                              className="button outline"
                              onClick={() => {
                                commit((_, cl) => {
                                  cl.locks = [];
                                  cl.protectedIds = [];
                                });
                                setGenerateStep("review");
                                setToast("已解锁位置，可重新生成。");
                              }}
                            >
                              解除所有位置锁定
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="drawer-footer-row">
                        <button
                          className="button outline"
                          onClick={() => setGenerateStep("review")}
                        >
                          <ArrowLeft size={16} /> 重新调整
                        </button>
                        <button
                          className="button primary"
                          disabled={proposals[proposalIndex]?.issues.some(
                            (i) => i.severity === "must",
                          )}
                          onClick={() => useProposal(proposals[proposalIndex])}
                        >
                          使用这个方案 <ArrowRight size={16} />
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
              {panel === "adjust" && (
                <>
                  <p className="muted">
                    只围绕 {current?.name ?? "选中学生"}{" "}
                    调整，优先影响更少的人。手工锁定的位置不会变化。
                  </p>
                  <div className="adjust-options">
                    {(
                      [
                        ["apart", "与某人分开"],
                        ["partner", "换一个同桌"],
                        ["front", "往前一点"],
                        ["back", "往后一点"],
                        ["middle", "换到中间"],
                        ["edge", "换到靠边"],
                      ] as [Adjustment, string][]
                    ).map(([v, label]) => (
                      <button
                        className={adjustWish === v ? "selected" : ""}
                        key={v}
                        onClick={() => {
                          setAdjustWish(v);
                          setAdjustProposals([]);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {adjustWish === "apart" && (
                    <label className="field">
                      与谁分开
                      <select
                        value={adjustOther}
                        onChange={(e) => {
                          setAdjustOther(e.target.value);
                          setAdjustProposals([]);
                        }}
                      >
                        <option value="">选择另一位学生</option>
                        {c.students
                          .filter((s) => s.id !== current?.id)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  <button
                    className="button primary full"
                    disabled={adjustWish === "apart" && !adjustOther}
                    onClick={() => findAdjust()}
                  >
                    寻找局部方案 <ArrowRight size={16} />
                  </button>
                  {adjustProposals.length > 0 && (
                    <>
                      <div className="drawer-section-title">只需调整这些人</div>
                      {adjustProposals.map((p, i) => (
                        <div className="adjust-proposal" key={p.id}>
                          <div>
                            <span className="proposal-letter">
                              {String.fromCharCode(65 + i)}
                            </span>
                            <strong>{p.label}</strong>
                          </div>
                          <p>{p.description}</p>
                          <small>
                            涉及：
                            {Object.values(p.assignments)
                              .filter(
                                (s) =>
                                  studentSeat(c.assignments, s) !==
                                  studentSeat(p.assignments, s),
                              )
                              .map((s) => studentName(c, s))
                              .join("、")}
                          </small>
                          <button
                            className="button outline"
                            onClick={() => applyAdjust(p)}
                          >
                            采用方案 {String.fromCharCode(65 + i)}
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                  {adjustProposals.length === 0 && adjustWish !== "apart" && (
                    <p className="muted">选择目标后点击“寻找局部方案”。</p>
                  )}
                </>
              )}
              {panel === "publish" && (
                <>
                  <h3>
                    准备发布第 {c.published ? c.round + 1 : 1} 轮座位
                  </h3>
                  <div className="publish-stats">
                    <div>
                      <strong>{c.students.length}</strong>
                      <span>名学生</span>
                    </div>
                    <div>
                      <strong>{draftChanged}</strong>
                      <span>人位置变化</span>
                    </div>
                    <div>
                      <strong>
                        {issues.filter((x) => x.severity === "must").length}
                      </strong>
                      <span>条必要规则问题</span>
                    </div>
                  </div>
                  {issues.filter((x) => x.severity === "must").length > 0 && (
                    <div className="conflict-box">
                      <strong>发布前请留意</strong>
                      {issues
                        .filter((x) => x.severity === "must")
                        .slice(0, 5)
                        .map((i) => (
                          <p key={i.id}>· {i.message}</p>
                        ))}
                      <button
                        className="text-action"
                        onClick={() => setPanel("rules")}
                      >
                        查看规则 <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                  {issues.filter((x) => x.severity === "prefer").length > 0 && (
                    <p className="soft-note">
                      {issues.filter((x) => x.severity === "prefer").length}{" "}
                      条“尽量”要求尚未满足。
                    </p>
                  )}
                  <div className="drawer-section-title">使用信息</div>
                  <div className="two-fields"><label className="field">开始使用日期<input type="date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} required /></label><label className="field">学期第几周（选填）<input type="number" min={1} max={30} step={1} value={publishWeek} onChange={(e) => setPublishWeek(e.target.value)} placeholder="例如 5" /></label></div>
                  <label className="field">这版座位的备注（选填）<textarea rows={2} value={publishNote} onChange={(e) => setPublishNote(e.target.value)} placeholder="例如：期中后调整；第一排保留单人座" /></label>
                  <div className="drawer-section-title">启用方式</div>
                  <div className="radio-list">
                    <label>
                      <input
                        type="radio"
                        checked={publishTiming === "now"}
                        onChange={() => setPublishTiming("now")}
                      />{" "}
                      立即使用
                    </label>
                    <label>
                      <input
                        type="radio"
                        checked={publishTiming === "later"}
                        onChange={() => setPublishTiming("later")}
                      />{" "}
                      下次换座时手动启用
                    </label>
                  </div>
                  <button
                    className="button primary full"
                    onClick={() => publish(false)}
                    disabled={!publishDate || issues.some((i) => i.severity === "must")}
                  >
                    {publishTiming === "later" ? "保存待启用座位" : "发布座位"} <ArrowRight size={16} />
                  </button>
                  {issues.some((i) => i.severity === "must") &&
                    issues
                      .filter((i) => i.severity === "must")
                      .every((i) => !!i.ruleId) && (
                      <button
                        className="button outline full"
                        onClick={() => publish(true)}
                      >
                        本次允许这些规则问题并发布
                      </button>
                    )}
                  <p className="muted">
                    发布后会保留历史版本；草稿仍可继续修改。
                  </p>
                </>
              )}
              {panel === "print" && (
                <>
                  <p className="muted">
                    打印时会明确标出黑板方向。学生版只含姓名和座位。
                  </p>
                  <div className="segmented">
                    <button
                      className={printPerspective === "teacher" ? "active" : ""}
                      onClick={() => setPrintPerspective("teacher")}
                    >
                      教师视角
                    </button>
                    <button
                      className={printPerspective === "student" ? "active" : ""}
                      onClick={() => setPrintPerspective("student")}
                    >
                      学生视角
                    </button>
                  </div>
                  <button
                    className="print-option"
                    onClick={() => openPrint("student")}
                  >
                    <Users size={22} />
                    <span>
                      <strong>学生版</strong>
                      <small>适合张贴、投影或分发</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                  <button
                    className="print-option"
                    onClick={() => openPrint("teacher")}
                  >
                    <BookOpen size={22} />
                    <span>
                      <strong>教师版</strong>
                      <small>包含规则提示和座位编号</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                </>
              )}
              {panel === "backup" && (
                <>
                  <p className="muted">
                    数据目前保存在这台设备的浏览器中。建议定期下载备份，换设备时可导入。
                  </p>
                  <button
                    className="button primary full"
                    onClick={exportBackup}
                  >
                    <Download size={17} /> 导出全部班级备份
                  </button>
                  <label className="field">
                    导入系统备份
                    <input
                      type="file"
                      accept="application/json,.json"
                      onChange={(e) => {
                        importBackup(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {importError && <p className="field-error">{importError}</p>}
                </>
              )}
            </div>
          </section>
        </div>
      )}
      <div className={`print-sheet ${printMode}`}>
        <h1>
          {c.name} · 第{" "}
          {!c.published || !hasDraftChanges ? c.round : c.round + 1} 轮座位表
          {hasDraftChanges && c.published ? "（草稿）" : ""}
        </h1>
        {printPerspective === "teacher" && <p>黑板 / 讲台</p>}
        {Array.from({ length: c.layout.rows }, (_, i) =>
          printPerspective === "teacher" ? i : c.layout.rows - 1 - i,
        ).map((row) => (
          <div className="print-row" key={row}>
            <b>第 {row + 1} 排</b>
            {Array.from({ length: rowPattern(c.layout, row).length }, (_, i) =>
              printPerspective === "teacher" ? i : rowPattern(c.layout, row).length - 1 - i,
            ).map((desk) => (
              <div className="print-desk" key={desk}>
                {(printPerspective === "teacher" ? Array.from({ length: rowPattern(c.layout, row)[desk] }, (_, i) => i) : Array.from({ length: rowPattern(c.layout, row)[desk] }, (_, i) => rowPattern(c.layout, row)[desk] - 1 - i)).map(
                  (side) => {
                    const seatId = `r${row}-d${desk}-s${side}`;
                    const sid = c.assignments[seatId];
                    const student = c.students.find((s) => s.id === sid);
                    return (
                      <span key={side}>
                        {student?.name ?? ""}
                        {printMode === "teacher" && (
                          <small>
                            {desk + 1} 组 {side ? "右" : "左"}座
                            {student &&
                            activeRules(c).some(
                              (r) =>
                                r.studentId === student.id ||
                                r.targetId === student.id,
                            )
                              ? " · 有规则"
                              : ""}
                          </small>
                        )}
                      </span>
                    );
                  },
                )}
              </div>
            ))}
          </div>
        ))}
        {printPerspective === "student" && <p>黑板 / 讲台</p>}
        <footer>
          {printPerspective === "teacher" ? "黑板方向 ↑" : "黑板方向 ↓"} ·{" "}
          {new Date().toLocaleDateString("zh-CN")}
        </footer>
        {printMode === "teacher" && (
          <div className="print-rule-notes">
            <h3>教师规则提示</h3>
            {activeRules(c).map((r) => (
              <p key={r.id}>
                {r.priority === "must" ? "必须" : "尽量"} · {ruleText(c, r)}
                {r.note ? ` · ${r.note}` : ""}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
