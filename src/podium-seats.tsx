import { ReactNode } from "react";
import { Layout } from "./model";

export function PodiumSeats({ layout, renderSeat }: { layout: Layout; renderSeat: (seatId: string) => ReactNode }) {
  if (!layout.podiumSeats?.length) return null;
  return <div className="podium-seats">
    {(["left", "right"] as const).filter((side) => layout.podiumSeats?.includes(side)).map((side) => (
      <div className={`podium-seat ${side}`} key={side}>
        <span className="podium-seat-label">值日班长 · {side === "left" ? "左" : "右"}侧</span>
        {renderSeat(`podium-${side}`)}
      </div>
    ))}
  </div>;
}
