export type OutlineBox = { x: number; y: number; w: number; h: number };

// Trace the outside of the union so an L-shaped group never outlines the
// student sitting in the empty corner of its bounding rectangle.
export function groupOutlinePath(boxes: OutlineBox[], padding = 7): string {
  if (!boxes.length) return "";
  const expanded = boxes.map(({ x, y, w, h }) => ({
    left: x - padding,
    top: y - padding,
    right: x + w + padding,
    bottom: y + h + padding,
  }));
  const xs = [...new Set(expanded.flatMap((box) => [box.left, box.right]))].sort((a, b) => a - b);
  const ys = [...new Set(expanded.flatMap((box) => [box.top, box.bottom]))].sort((a, b) => a - b);
  const filled = Array.from({ length: ys.length - 1 }, (_, row) =>
    Array.from({ length: xs.length - 1 }, (_, col) => {
      const x = (xs[col] + xs[col + 1]) / 2;
      const y = (ys[row] + ys[row + 1]) / 2;
      return expanded.some((box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom);
    }),
  );
  const edges: string[] = [];
  for (let row = 0; row < filled.length; row++) {
    for (let col = 0; col < filled[row].length; col++) {
      if (!filled[row][col]) continue;
      const [left, right, top, bottom] = [xs[col], xs[col + 1], ys[row], ys[row + 1]];
      if (!filled[row - 1]?.[col]) edges.push(`M${left} ${top}H${right}`);
      if (!filled[row][col + 1]) edges.push(`M${right} ${top}V${bottom}`);
      if (!filled[row + 1]?.[col]) edges.push(`M${left} ${bottom}H${right}`);
      if (!filled[row][col - 1]) edges.push(`M${left} ${top}V${bottom}`);
    }
  }
  return edges.join(" ");
}
