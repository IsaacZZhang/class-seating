import { useLayoutEffect, useRef, useState } from "react";
import { ClassData } from "./model";
import { viewIndices } from "./layout-view";
import { activeRules, rowPattern, ruleText, seatsOf, sideText } from "./seating";

type PrintProps = {
  klass: ClassData;
  mode: "student" | "teacher";
  perspective?: "student" | "teacher";
  round: number;
  draft?: boolean;
};

export function PrintSeating({ klass, mode, perspective = klass.layout.podiumPosition === "bottom" ? "student" : "teacher", round, draft, previewScale }: PrintProps & { previewScale?: number }) {
  const teacherView = perspective === "teacher";
  const position = teacherView ? "top" : "bottom";
  const students = new Map(klass.students.map((student) => [student.id, student]));
  const available = new Set(seatsOf(klass).map((seat) => seat.id));
  const rules = activeRules(klass);
  const withRules = new Set(rules.flatMap((rule) => [rule.studentId, ...(rule.targetId ? [rule.targetId] : [])]));
  const rows = viewIndices(klass.layout.rows, position);
  const waiting = klass.students.filter((student) => !Object.entries(klass.assignments).some(([seatId, studentId]) => available.has(seatId) && studentId === student.id));
  function stage() {
    const sides = teacherView ? ["left", "right"] as const : ["right", "left"] as const;
    return <div className="print-front">
      {sides.map((side, index) => <div className={`print-duty print-duty-${index}`} key={side}>
        {available.has(`podium-${side}`) && <><small>值日 · 讲台{side === "left" ? "左" : "右"}侧</small><strong>{students.get(klass.assignments[`podium-${side}`])?.name || "—"}</strong></>}
      </div>)}
      <div className="print-blackboard"><strong>黑板 / 讲台</strong></div>
    </div>;
  }
  return <section
    className={`print-sheet ${klass.layout.rows > 9 ? "dense" : ""} ${mode} ${previewScale !== undefined ? "print-preview-sheet" : ""}`}
    aria-label={previewScale !== undefined ? "座位表打印预览" : "打印座位表"}
    style={{ ...(previewScale !== undefined ? { zoom: previewScale } : {}), "--print-seat-height": klass.layout.rows > 9 ? "8mm" : "12mm" } as React.CSSProperties}
  >
    <header className="print-title"><div><span className="print-eyebrow">班级座位表</span><h1>{klass.name}</h1></div><div className="print-meta"><strong>第 {round} 轮{draft ? " · 草稿" : ""}</strong><span>{klass.students.length} 名学生 · {teacherView ? "从讲台看向学生" : "从座位面向黑板"}</span></div></header>
    {teacherView && stage()}
    <div className="print-grid">
      {rows.map((row) => <div className="print-row" key={row}>
        <b className="print-row-label">{row + 1}<small>排</small></b>
        <div className="print-desks" style={{ gridTemplateColumns: viewIndices(rowPattern(klass.layout, row).length, position).map((desk) => `minmax(0, ${rowPattern(klass.layout, row)[desk]}fr)`).join(" ") }}>
          {viewIndices(rowPattern(klass.layout, row).length, position).map((desk) => <div className="print-desk" key={desk}>
            {viewIndices(rowPattern(klass.layout, row)[desk], position).map((side) => {
              const seatId = `r${row}-d${desk}-s${side}`;
              const enabled = available.has(seatId);
              const student = enabled ? students.get(klass.assignments[seatId]) : undefined;
              return <div className={`print-seat ${!enabled ? "unavailable" : !student ? "vacant" : ""}`} key={side} data-print-seat={seatId}>
                <strong>{student?.name || "—"}{mode === "teacher" && student && withRules.has(student.id) && <sup>＊</sup>}</strong>
                {mode === "teacher" && <small>{enabled ? `${desk + 1}组 · ${sideText(rowPattern(klass.layout, row)[desk], side)}` : "停用"}</small>}
              </div>;
            })}
          </div>)}
        </div>
      </div>)}
    </div>
    {!teacherView && stage()}
    <footer className="print-footer"><span>{teacherView ? "讲台在上方 ↑" : "讲台在下方 ↓"}{waiting.length ? ` · ${waiting.length} 人待安排` : ""}</span><span>{mode === "teacher" ? "教师版" : "学生版"} · A4 横向 · {new Date().toLocaleDateString("zh-CN")}</span></footer>
    {mode === "teacher" && (rules.length > 0 || waiting.length > 0) && <aside className="print-notes">
      <h2>教师备注</h2>
      {waiting.length > 0 && <p>待安排：{waiting.map((student) => student.name).join("、")}</p>}
      {rules.map((rule) => <p key={rule.id}><b>{rule.priority === "must" ? "必须" : "尽量"}</b> {ruleText(klass, rule)}{rule.note ? ` · ${rule.note}` : ""}</p>)}
    </aside>}
  </section>;
}

export function PrintPreview(props: PrintProps) {
  const root = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const resize = () => setScale(Math.min(1, Math.max(0.1, (element.clientWidth - 24) / (297 * 96 / 25.4))));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div className="print-preview" ref={root}><PrintSeating {...props} previewScale={scale} /></div>;
}
