import { RefObject, useLayoutEffect, useState } from "react";
import { groupClusters } from "./groups";
import { Assignment, ClassData } from "./model";
import { seatsOf, studentSeat } from "./seating";

export type GroupRing = {
  key: string;
  name: string;
  color: string;
  groupId: string;
  studentIds: string[];
  x: number;
  y: number;
  w: number;
  h: number;
};

function soften(hex: string) {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw;
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return "rgb(143 180 220)";
  const channel = (shift: number) => {
    const part = (value >> shift) & 255;
    return Math.round(part + (255 - part) * 0.62);
  };
  return `rgb(${channel(16)} ${channel(8)} ${channel(0)})`;
}

export function GroupRings({
  rootRef,
  c,
  assignments,
  interactive = false,
  onDragGroup,
  onDragEnd,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  c: ClassData;
  assignments: Assignment;
  interactive?: boolean;
  onDragGroup?: (studentIds: string[], anchorId: string) => void;
  onDragEnd?: () => void;
}) {
  const [rings, setRings] = useState<GroupRing[]>([]);
  const signature = `${c.layout.rows}:${JSON.stringify(c.layout.rowPatterns)}:${JSON.stringify(assignments)}:${(c.groups ?? []).map((group) => group.id + group.color).join("|")}:${c.students.map((student) => student.groupId ?? "").join(",")}`;
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const bounds = root.getBoundingClientRect();
      const boxes = new Map(
        [...root.querySelectorAll<HTMLElement>("[data-seat-id]")].map((node) => {
          const rect = node.getBoundingClientRect();
          return [
            node.dataset.seatId ?? "",
            {
              x: rect.left - bounds.left,
              y: rect.top - bounds.top,
              w: rect.width,
              h: rect.height,
            },
          ] as const;
        }),
      );
      const pad = 7;
      const next = groupClusters(seatsOf(c), assignments, c.students).flatMap((cluster) => {
        const frames = cluster.seatIds
          .map((seatId) => boxes.get(seatId))
          .filter((box): box is { x: number; y: number; w: number; h: number } => !!box);
        if (!frames.length) return [];
        const group = (c.groups ?? []).find((item) => item.id === cluster.groupId);
        const left = Math.min(...frames.map((box) => box.x)) - pad;
        const top = Math.min(...frames.map((box) => box.y)) - pad;
        const right = Math.max(...frames.map((box) => box.x + box.w)) + pad;
        const bottom = Math.max(...frames.map((box) => box.y + box.h)) + pad;
        return [{
          key: `${cluster.groupId}:${cluster.seatIds.slice().sort().join(",")}`,
          name: group?.name ?? "小组",
          color: soften(group?.color ?? "#7ea2d4"),
          groupId: cluster.groupId,
          studentIds: cluster.studentIds,
          x: left,
          y: top,
          w: Math.max(12, right - left),
          h: Math.max(12, bottom - top),
        }];
      });
      setRings(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root.querySelectorAll<HTMLElement>("[data-seat-id]").forEach((node) => observer.observe(node));
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [rootRef, signature, c, assignments]);
  if (!rings.length) return null;
  return (
    <>
      <svg className="group-rings" aria-hidden="true">
        {rings.map((ring) => (
          <rect
            key={ring.key}
            x={ring.x}
            y={ring.y}
            width={ring.w}
            height={ring.h}
            rx={Math.min(36, ring.w / 2, ring.h / 2)}
            fill={ring.color.replace("rgb", "rgba").replace(")", " / 0.16)")}
            stroke={ring.color}
          />
        ))}
      </svg>
      {interactive &&
        rings.map((ring) => (
          <button
            key={`${ring.key}-handle`}
            type="button"
            className="group-handle"
            style={{ left: ring.x + ring.w / 2, top: ring.y }}
            draggable
            title={`拖动${ring.name}。落到的座位是这组最靠前同学的新位置`}
            onDragStart={(event) => {
              const seats = seatsOf(c);
              const ordered = [...ring.studentIds].sort((a, b) => {
                const left = seats.find((seat) => seat.id === studentSeat(assignments, a));
                const right = seats.find((seat) => seat.id === studentSeat(assignments, b));
                return (left?.row ?? 0) - (right?.row ?? 0) || (left?.col ?? 0) - (right?.col ?? 0);
              });
              const anchor = ordered[0];
              if (!anchor) return;
              event.dataTransfer.setData("text/plain", `formation:${anchor}:${ordered.join(",")}`);
              event.dataTransfer.effectAllowed = "move";
              onDragGroup?.(ordered, anchor);
            }}
            onDragEnd={() => onDragEnd?.()}
          >
            {ring.name}
          </button>
        ))}
    </>
  );
}
