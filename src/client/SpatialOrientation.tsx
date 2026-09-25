import type { Position, ViewSettings } from '../shared/personal-view.js';

const axisStyles = [
  { letter: 'X', color: '#ffa397' },
  { letter: 'Y', color: '#a8e6ac' },
  { letter: 'Z', color: '#95cfff' },
] as const;

export function SpatialOrientation({
  orientation,
  corner,
}: {
  orientation: Position[];
  corner: ViewSettings['axisCorner'];
}) {
  const labels: { x: number; y: number }[] = [];
  const axes = axisStyles
    .flatMap((style, index) => {
      const direction = orientation[index];
      return direction ? [{ ...style, ...direction }] : [];
    })
    // In camera coordinates, positive Z points toward the viewer.
    .sort((a, b) => a.z - b.z);

  return (
    <svg
      className={`spatial-axis ${corner}`}
      role="img"
      aria-label="Rummets axlar: sidled X, höjd Y, djup Z"
      viewBox="0 0 90 90"
      pointerEvents="none"
    >
      <circle cx="45" cy="45" r="2" fill="#e7f2e9" />
      {axes.map(({ letter, color, x, y, z }) => {
        const length = Math.hypot(x, y);
        const dx = length ? x / length : 0.7;
        const dy = length ? -y / length : 0.7;
        const tipX = 45 + x * 28;
        const tipY = 45 - y * 28;
        const labelX = tipX + dx * 10;
        const labelY = tipY + dy * 10 + 4;
        const freeY = [labelY, labelY - 14, labelY + 14, labelY - 28, labelY + 28].find(
          (candidate) =>
            candidate >= 10 &&
            candidate <= 86 &&
            labels.every(
              (label) => Math.abs(label.x - labelX) >= 13 || Math.abs(label.y - candidate) >= 14,
            ),
        );
        const textY = freeY ?? labelY;
        labels.push({ x: labelX, y: textY });

        return (
          <g key={letter} data-axis={letter} style={{ color }}>
            <path d={`M45 45L${tipX} ${tipY}`} stroke={color} strokeWidth="2" />
            {length < 0.24 ? (
              <>
                <circle cx={tipX} cy={tipY} r="5" fill="#10251f" stroke={color} strokeWidth="1.5" />
                {z > 0 ? (
                  <circle cx={tipX} cy={tipY} r="1.8" fill={color} />
                ) : (
                  <path
                    d={`M${tipX - 2} ${tipY - 2}l4 4m-4 0l4-4`}
                    stroke={color}
                    strokeWidth="1.5"
                  />
                )}
              </>
            ) : (
              <path
                d={`M${tipX - dx * 6 - dy * 3} ${tipY - dy * 6 + dx * 3}L${tipX} ${tipY}L${tipX - dx * 6 + dy * 3} ${tipY - dy * 6 - dx * 3}`}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            <text
              x={labelX}
              y={textY}
              textAnchor="middle"
              fontSize="12"
              fontWeight="700"
              fill={color}
              stroke="#10251f"
              strokeWidth="3"
              paintOrder="stroke"
            >
              {letter}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
