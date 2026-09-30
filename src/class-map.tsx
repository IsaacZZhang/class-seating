import type { CSSProperties } from "react";
import boyAvatar from "../ui/png/男生无眼镜.png";
import boyGlassesAvatar from "../ui/png/男生戴眼镜.png";
import girlAvatar from "../ui/png/女生无眼镜.png";
import girlGlassesAvatar from "../ui/png/女生戴眼镜.png";
import { Assignment, ClassData, Student } from "./model";
import { rowPattern, seatsOf } from "./seating";

function avatarFor(student: Student) {
  if (student.gender === "boy") return student.glasses ? boyGlassesAvatar : boyAvatar;
  if (student.gender === "girl") return student.glasses ? girlGlassesAvatar : girlAvatar;
  return "";
}

export function GroupLegend({ klass }: { klass: ClassData }) {
  if (!(klass.groups ?? []).length) return null;
  return (
    <div className="group-legend">
      {(klass.groups ?? []).map((group) => (
        <span key={group.id}>
          <i style={{ background: group.color }} />
          {group.name}
        </span>
      ))}
    </div>
  );
}

export function ClassMap({
  klass,
  assignments = klass.assignments,
  onSeat,
  markedSeats = [],
  readOnly = false,
}: {
  klass: ClassData;
  assignments?: Assignment;
  onSeat?: (seatId: string) => void;
  markedSeats?: string[];
  readOnly?: boolean;
}) {
  const seatMap = new Map(seatsOf(klass).map((seat) => [seat.id, seat]));
  const studentById = new Map(klass.students.map((student) => [student.id, student]));
  return (
    <div
      className="classroom classroom-public"
      style={
        {
          "--seat-zoom": 1,
          "--row-count": klass.layout.rows,
          "--row-seat-ratio": 1.04 / Math.max(1, klass.layout.rows),
        } as CSSProperties
      }
    >
      <div className="classroom-front">
        <span className="window-label">窗 · {klass.layout.windowSide === "left" ? "左" : "右"}</span>
        <div className="blackboard">
          黑板 <small>讲台在这一侧</small>
        </div>
        <span className="door-label">门 · {klass.layout.doorSide === "right" ? "右" : "左"}</span>
      </div>
      <div className="rows">
        {Array.from({ length: klass.layout.rows }, (_, row) => (
          <div className="seat-row" key={row}>
            <div className="row-label">第 {row + 1} 排</div>
            <div className="desks" style={{ gridTemplateColumns: `repeat(${Math.max(1, rowPattern(klass.layout, row).length)},minmax(0,1fr))` }}>
              {rowPattern(klass.layout, row).map((capacity, desk) => (
                <div className="desk" key={desk} style={{ gridColumn: desk + 1 }}>
                  {Array.from({ length: capacity }, (_, side) => {
                    const seatId = `r${row}-d${desk}-s${side}`;
                    if (!seatMap.has(seatId)) return <span key={seatId} className="seat-hidden" />;
                    const student = studentById.get(assignments[seatId] ?? "");
                    const group = student?.groupId
                      ? (klass.groups ?? []).find((item) => item.id === student.groupId)
                      : (klass.groups ?? []).find((item) => item.zone.includes(seatId));
                    const avatar = student ? avatarFor(student) : "";
                    return (
                      <button
                        type="button"
                        key={seatId}
                        className={`seat ${student ? "" : "empty"} ${markedSeats.includes(seatId) ? "zone-mark" : ""}`}
                        disabled={readOnly}
                        onClick={() => onSeat?.(seatId)}
                      >
                        {group && <span className="group-stripe" style={{ background: group.color }} />}
                        {avatar && (
                          <span className="avatar student-avatar">
                            <img src={avatar} alt="" />
                          </span>
                        )}
                        <span className="seat-name">{student?.name ?? "空位"}</span>
                        {student && <span className="seat-points">{student.points ?? 0}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
