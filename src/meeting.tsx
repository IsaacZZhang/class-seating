import { useState } from "react";
import { LockKeyhole, X } from "lucide-react";
import { ClassMap, GroupLegend } from "./class-map";
import { verifyPin } from "./cloud";
import {
  assignZoneByPoints,
  groupPoints,
  groupsByPriority,
  seatingMembersByPoints,
  nextTurn,
  placeInZone,
  zoneError,
} from "./groups";
import { seatsOf } from "./seating";
import { ClassData } from "./model";
export function MeetingScreen({
  klass,
  onCommit,
  onPoints,
  onExit,
}: {
  klass: ClassData;
  onCommit: (update: (value: ClassData) => void) => void;
  onPoints: (studentId: string, delta: number, reason?: string) => Promise<void>;
  onExit: () => void;
}) {
  const [draft, setDraft] = useState<string[]>([]);
  const [manualGroup, setManualGroup] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [pinOpen, setPinOpen] = useState<"unlock" | "exit" | "">("");
  const [dock, setDock] = useState<"points" | "groups" | "">("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const turn = nextTurn(klass);
  const activeGroup =
    (klass.groups ?? []).find((group) => group.id === manualGroup) ??
    (turn.phase === "zone" || turn.phase === "seat" ? turn.group : undefined);
  const members = activeGroup ? seatingMembersByPoints(klass, activeGroup.id) : [];

  function chooseSeat(seatId: string) {
    setMessage("");
    if (seatsOf(klass).find((seat) => seat.id === seatId)?.podiumSide) { setMessage("值日由教师在教室编辑中指定，不参与小组选座。"); return; }
    if (manualGroup && activeGroup) {
      const next = draft.includes(seatId) ? draft.filter((item) => item !== seatId) : [...draft, seatId];
      setDraft(next);
      return;
    }
    if (turn.phase === "zone") {
      const next = draft.includes(seatId) ? draft.filter((item) => item !== seatId) : [...draft, seatId];
      setDraft(next);
      return;
    }
    if (turn.phase !== "seat") return;
    if (!turn.group.zone.includes(seatId)) {
      setMessage("请在已经圈出的小组区域里选座。");
      return;
    }
    if (klass.assignments[seatId]) {
      setMessage("这个座位已经有人了。");
      return;
    }
    onCommit((value) => {
      value.assignments = placeInZone(value.assignments, turn.student.id, seatId);
      value.seatingMode = "group";
    });
  }

  function confirmZone() {
    if (!activeGroup) return;
    const error = zoneError(klass, activeGroup.id, draft);
    if (error) {
      setMessage(error);
      return;
    }
    onCommit((value) => {
      const group = (value.groups ?? []).find((item) => item.id === activeGroup.id);
      if (group) group.zone = [...draft];
      value.seatingMode = "group";
    });
    setDraft([]);
    setManualGroup("");
    setMessage("");
  }

  async function unlock(pin: string) {
    if (await verifyPin(pin)) {
      setUnlocked(true);
      setPinOpen("");
      setDock("points");
      return "";
    }
    return "PIN 不正确";
  }

  const headline =
    manualGroup && activeGroup
      ? `为${activeGroup.name}指定区域`
      : turn.phase === "need-groups"
        ? "先在教师操作里分好小组"
        : turn.phase === "zone"
          ? `${turn.group.name}优先选区域`
          : turn.phase === "seat"
            ? `${turn.student.name}优先选座 · ${turn.student.points ?? 0} 分`
            : "这一轮座位已经选完";

  return (
    <main className="projection meeting" aria-label="课堂排座">
      <header className="projection-header">
        <div>
          <span className="eyebrow">班会选座</span>
          <h1>
            {klass.name} <span>{headline}</span>
          </h1>
        </div>
        <div className="projection-actions">
          {unlocked ? (
            <button className="button ghost" onClick={() => { setUnlocked(false); setDock(""); }}>
              <LockKeyhole size={18} /> 锁定
            </button>
          ) : (
            <button className="button ghost" onClick={() => setPinOpen("unlock")}>
              教师操作
            </button>
          )}
          <button className="button ghost" onClick={() => (unlocked ? onExit() : setPinOpen("exit"))}>
            <X size={18} /> 退出课堂
          </button>
        </div>
      </header>
      <div className="projection-body">
        <div>
          <GroupLegend klass={klass} />
          <ClassMap klass={klass} onSeat={chooseSeat} markedSeats={draft.length ? draft : activeGroup?.zone ?? []} readOnly={turn.phase === "need-groups" && !manualGroup} />
        </div>
        <aside className="projection-guide">
          <h2>{headline}</h2>
          {activeGroup && (turn.phase === "zone" || manualGroup) && (
            <>
              <p>
                {activeGroup.name}共 {members.length} 人，小组积分 {groupPoints(klass.students, activeGroup.id)}。点选 {members.length} 个连在一起的座位。
              </p>
              <button className="button primary" onClick={confirmZone} disabled={draft.length !== members.length}>
                确认这片区域
              </button>
            </>
          )}
          {turn.phase === "seat" && !manualGroup && (
            <>
              <p>现在只由 {turn.student.name} 选择。积分更高的同学先选，座位限定在本组区域内。</p>
              <button
                className="button subtle"
                onClick={() =>
                  onCommit((value) => {
                    value.assignments = assignZoneByPoints(value, turn.group.id, value.assignments);
                  })
                }
              >
                按积分自动入座
              </button>
            </>
          )}
          {turn.phase === "done" && !manualGroup && <p>各组都坐在自己的区域里了。可以锁定屏幕，或进入教师操作继续加减分。</p>}
          {message && <p className="field-error">{message}</p>}
          <div className="turn-list">
            {groupsByPriority(klass).map((group, index) => (
              <div key={group.id}>
                <i style={{ background: group.color }} />
                <b>
                  {index + 1}. {group.name}
                </b>
                <small>{groupPoints(klass.students, group.id)} 分</small>
              </div>
            ))}
          </div>
          {unlocked && (
            <div className="teacher-dock">
              <div className="gate-switch">
                <button type="button" className={dock === "points" ? "active" : ""} onClick={() => setDock("points")}>
                  加减分
                </button>
                <button type="button" className={dock === "groups" ? "active" : ""} onClick={() => setDock("groups")}>
                  指定小组
                </button>
              </div>
              {dock === "points" && (
                <>
                  <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="原因，可不填" maxLength={40} />
                  <div className="point-list">
                    {klass.students.map((student) => (
                      <div key={student.id}>
                        <span>
                          {student.name}
                          <small>{student.points ?? 0}</small>
                        </span>
                        <button className="button mini" onClick={() => void onPoints(student.id, -1, reason)}>-1</button>
                        <button className="button mini" onClick={() => void onPoints(student.id, 1, reason)}>+1</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {dock === "groups" && (
                <div className="point-list">
                  {(klass.groups ?? []).map((group) => (
                    <button
                      key={group.id}
                      className="button subtle"
                      onClick={() => {
                        setManualGroup(group.id);
                        setDraft([]);
                        setDock("");
                      }}
                    >
                      让{group.name}重选区域
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
      {pinOpen && (
        <PinDialog
          title={pinOpen === "exit" ? "退出课堂屏" : "教师操作"}
          onClose={() => setPinOpen("")}
          onSubmit={async (pin) => {
            const error = await unlock(pin);
            if (error) return error;
            if (pinOpen === "exit") onExit();
            return "";
          }}
        />
      )}
    </main>
  );
}

export function PinDialog({
  title,
  onClose,
  onSubmit,
  confirmNew = false,
  askCurrent = false,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (pin: string, current?: string) => Promise<string>;
  confirmNew?: boolean;
  askCurrent?: boolean;
}) {
  const [current, setCurrent] = useState("");
  const [pin, setPinValue] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");

  return (
    <div className="pin-layer">
      <form
        className="gate-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (!/^\d{4,8}$/.test(pin)) {
            setError("PIN 需要 4 到 8 位数字");
            return;
          }
          if (confirmNew && pin !== again) {
            setError("两次输入不一致");
            return;
          }
          void onSubmit(pin, current).then((message) => {
            if (message) setError(message);
          });
        }}
      >
        <h2>{title}</h2>
        {askCurrent && (
          <label>
            当前 PIN
            <input inputMode="numeric" autoComplete="off" value={current} onChange={(event) => setCurrent(event.target.value)} />
          </label>
        )}
        <label>
          {askCurrent ? "新 PIN" : "PIN"}
          <input inputMode="numeric" autoComplete="off" value={pin} onChange={(event) => setPinValue(event.target.value)} autoFocus />
        </label>
        {confirmNew && (
          <label>
            再输入一次
            <input inputMode="numeric" autoComplete="off" value={again} onChange={(event) => setAgain(event.target.value)} />
          </label>
        )}
        {error && <p className="field-error">{error}</p>}
        <button className="button primary full">确认</button>
        <button type="button" className="button subtle full" onClick={onClose}>
          取消
        </button>
      </form>
    </div>
  );
}
