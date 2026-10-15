import classroom from "../ui/webp/classroom.webp";

// Turn the room illustration while keeping its embedded signs readable.
const signs = [
  { x: 568, y: 58, width: 120, height: 50 },
  { x: 586, y: 207, width: 86, height: 42 },
  { x: 916, y: 66, width: 104, height: 46 },
];

export function ClassroomBackdrop() {
  return <svg className="classroom-backdrop" viewBox="0 0 1254 1254" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <image href={classroom} width="1254" height="1254" transform="rotate(180 627 627)" />
    {signs.map(({ x, y, width, height }) => <svg key={y} x={1254 - x - width} y={1254 - y - height} width={width} height={height} viewBox={`${x} ${y} ${width} ${height}`} overflow="hidden">
      <image href={classroom} width="1254" height="1254" />
    </svg>)}
  </svg>;
}
