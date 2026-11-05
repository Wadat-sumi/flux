import type { Sample } from "../engine/statistics";

export function Chart({
  history,
  metric = "throughput",
  label,
  compact = false,
  scaleMax,
}: {
  history: Sample[];
  metric?: "throughput" | "meanTravelTime" | "queue";
  label: string;
  compact?: boolean;
  scaleMax?: number;
}) {
  const values = history.map((s) => s[metric]),
    max = Math.max(1, scaleMax ?? 0, ...values);
  const points = values
    .map(
      (v, i) =>
        `${12 + (i / Math.max(1, values.length - 1)) * 376},${75 - (v / max) * 56}`,
    )
    .join(" ");
  return (
    <div className={`chart ${compact ? "compact" : ""}`} data-scale-max={max}>
      <div className="chart-heading"><div className="eyebrow">{label}</div><span className="chart-current">{values.length ? (values.at(-1) ?? 0).toFixed(1) : '—'}</span></div>
      <svg
        viewBox="0 0 400 90"
        role="img"
        aria-label={`${label}; latest ${Math.round(values.at(-1) ?? 0)}`}
      >
        {[20, 48, 76].map((y) => (
          <line key={y} x1="12" x2="388" y1={y} y2={y} stroke="var(--line)" />
        ))}
        {values.length > 0 && <text x="12" y="14" fill="var(--muted)" fontSize="9">{Math.round(max)}</text>}
        {values.length > 1 && (
          <>
            <polygon
              points={`12,76 ${points} 388,76`}
              fill="var(--violet-faint)"
            />
            <polyline
              points={points}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          </>
        )}
        {!values.length && (
          <text
            x="200"
            y="53"
            textAnchor="middle"
            fill="var(--muted)"
            fontSize="12"
          >
            Run a simulation to collect observations
          </text>
        )}
        <text x="12" y="89" fill="var(--muted)" fontSize="9">
          0 s
        </text>
        <text x="388" y="89" textAnchor="end" fill="var(--muted)" fontSize="9">
          {Math.round(history.at(-1)?.time ?? 0)} s
        </text>
      </svg>
    </div>
  );
}
