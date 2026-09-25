import type { Position } from '../shared/personal-view.js';

type ScreenPoint = { x: number; y: number };

export function SpatialHeightGuide({
  start,
  end,
  project,
}: {
  start: Position;
  end: Position;
  project: (position: Position) => ScreenPoint | null | undefined;
}) {
  const origin = project(start);
  const current = project(end);
  if (!origin || !current) return null;

  // The plane belongs to this gesture's start, so it stays still while the
  // object moves. Its coordinates describe the personal view, not the object.
  const planeY = start.y - 4;
  const lower = Math.min(planeY, end.y) - 2;
  const upper = Math.max(start.y, end.y) + 2;
  const point = (x: number, y: number, z: number) => project({ x, y, z });
  const axisPoint = (y: number) => point(start.x, y, start.z);
  const foot = axisPoint(planeY);
  const top = axisPoint(upper);
  const bottom = axisPoint(lower);
  if (!foot || !top || !bottom) return null;

  const segment = (a: ScreenPoint | null | undefined, b: ScreenPoint | null | undefined) =>
    a && b && [a.x, a.y, b.x, b.y].every(Number.isFinite) ? `M${a.x} ${a.y}L${b.x} ${b.y}` : '';
  const grid = [-3, -1.5, 0, 1.5, 3]
    .flatMap((offset) => [
      segment(
        point(start.x + offset, planeY, start.z - 3),
        point(start.x + offset, planeY, start.z + 3),
      ),
      segment(
        point(start.x - 3, planeY, start.z + offset),
        point(start.x + 3, planeY, start.z + offset),
      ),
    ])
    .join('');
  const footprint = Array.from({ length: 25 }, (_, index) => {
    const angle = (index * Math.PI) / 12;
    return point(start.x + Math.cos(angle) * 0.6, planeY, start.z + Math.sin(angle) * 0.6);
  });
  if (
    [origin, current, foot, top, bottom, ...footprint].some(
      (value) => !value || !Number.isFinite(value.x) || !Number.isFinite(value.y),
    )
  )
    return null;

  // Keep the axis readable even after a large move or a far zoom out.
  const tickStep = Math.max(1, 10 ** Math.floor(Math.log10((upper - lower) / 8)));
  const firstTick = Math.ceil(lower / tickStep);
  const tickCount = Math.min(40, Math.floor(upper / tickStep) - firstTick + 1);
  const ticks = Array.from({ length: tickCount }, (_, index) => {
    const y = (firstTick + index) * tickStep;
    return segment(point(start.x - 0.25, y, start.z), point(start.x + 0.25, y, start.z));
  }).join('');
  const difference = end.y - start.y;
  const amount = Math.abs(difference).toLocaleString('sv-SE', { maximumFractionDigits: 1 });
  const description =
    Math.abs(difference) < 0.05
      ? 'Startläge'
      : `${difference > 0 ? '↑' : '↓'} ${amount} steg ${difference > 0 ? 'högre' : 'lägre'} än start`;

  return (
    <g className="spatial-height-guide" pointerEvents="none" fill="none">
      <path d={grid} stroke="#507d89" strokeWidth="1" />
      <path
        d={`${footprint.map((value, index) => `${index ? 'L' : 'M'}${value?.x} ${value?.y}`).join('')}Z`}
        fill="#62d8ff"
        fillOpacity="0.12"
        stroke="#81c9dc"
      />
      <path d={segment(current, foot)} stroke="#8ad0e1" strokeWidth="1.5" strokeDasharray="5 6" />
      <path d={segment(top, bottom)} stroke="#549aac" strokeWidth="1" strokeDasharray="3 7" />
      <path d={ticks} stroke="#81c9dc" strokeWidth="1" />
      <path d={segment(origin, current)} stroke="#6de4ff" strokeWidth="3" />
      <circle cx={top.x} cy={top.y} r="3" fill="#6de4ff" />
      <circle cx={bottom.x} cy={bottom.y} r="3" fill="#6de4ff" />
      <circle cx={origin.x} cy={origin.y} r="23" stroke="#b6d6e2" strokeDasharray="4 5" />
      <circle cx={current.x} cy={current.y} r="27" stroke="#6de4ff" strokeWidth="2" />
      <g fontSize="11" stroke="#102e2c" strokeWidth="3" paintOrder="stroke">
        <text x={origin.x + 29} y={origin.y - 14} fill="#b6d6e2">
          Start
        </text>
        <text x={foot.x + 18} y={foot.y + 16} fill="#8fbcca">
          Hjälpplan
        </text>
      </g>
      <svg x="12" y="12" width="calc(100% - 24px)" height="80" overflow="hidden">
        <title>Höjdflyttning: {description}</title>
        <rect width="310" height="76" rx="7" fill="#0a202b" fillOpacity="0.96" stroke="#549aac" />
        <text x="12" y="22" fill="#8ae6f8" fontSize="13">
          Höjdflyttning · personlig vy
        </text>
        <text x="12" y="43" fill="#e4f7fc" fontSize="13">
          {description}
        </text>
        <text x="12" y="63" fill="#a6c6d1" fontSize="11">
          Sidled och djup är låsta. Stegen gäller vyn.
        </text>
      </svg>
    </g>
  );
}
