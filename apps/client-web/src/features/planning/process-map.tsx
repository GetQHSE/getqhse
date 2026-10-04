import type { PlanningDocument } from "@qhse/contracts";
export function ProcessMap({
  document: d,
  labels,
}: {
  document: PlanningDocument;
  labels: {
    management: string;
    realization: string;
    support: string;
    globalInput: string;
    globalOutput: string;
  };
}) {
  const ps = d.processes.filter((p) => p.decision === "retained");
  const positions = new Map<string, { x: number; y: number }>();
  const families = ["management", "realization", "support"] as const;
  const max = Math.max(1, ...families.map((f) => ps.filter((p) => p.family === f).length)),
    width = Math.max(860, max * 210 + 190);
  families.forEach((f, row) =>
    ps
      .filter((p) => p.family === f)
      .forEach((p, col) => positions.set(p.id, { x: 180 + col * 210, y: 100 + row * 170 })),
  );
  return (
    <div className="planning-map">
      <svg
        viewBox={`0 0 ${width} 640`}
        role="img"
        aria-label={labels.globalInput + " → " + labels.globalOutput}
      >
        <defs>
          <marker
            id="planning-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b5cf6" />
          </marker>
        </defs>
        <rect x="12" y="10" width={width - 24} height="48" rx="10" fill="#ede9fe" />
        <text x={width / 2} y="40" textAnchor="middle">
          {labels.globalInput}
        </text>
        {families.map((f, row) => (
          <g key={f}>
            <rect
              x="12"
              y={84 + row * 170}
              width={width - 24}
              height="145"
              rx="12"
              fill={f === "realization" ? "#eff6ff" : "#f8fafc"}
            />
            <text x="28" y={115 + row * 170} fontWeight="600">
              {labels[f]}
            </text>
          </g>
        ))}
        {d.interactions
          .filter((i) => i.decision === "retained")
          .map((i) => {
            const a = positions.get(i.from),
              b = positions.get(i.to);
            if (!a || !b) return null;
            const x1 = a.x + 88,
              y1 = a.y + 90,
              x2 = b.x + 88,
              y2 = b.y;
            return (
              <path
                key={i.id}
                d={`M ${x1} ${y1} C ${x1} ${y1 + 42}, ${x2} ${y2 - 42}, ${x2} ${y2}`}
                fill="none"
                stroke="#8b5cf6"
                strokeWidth="2"
                markerEnd="url(#planning-arrow)"
              >
                <title>{i.flow}</title>
              </path>
            );
          })}
        {ps.map((p) => {
          const a = positions.get(p.id)!;
          return (
            <g key={p.id}>
              <rect x={a.x} y={a.y} width="180" height="90" rx="9" fill="white" stroke="#cbd5e1" />
              <foreignObject x={a.x + 10} y={a.y + 10} width="160" height="70">
                <div className="planning-map-node">{p.title}</div>
              </foreignObject>
            </g>
          );
        })}
        <rect x="12" y="588" width={width - 24} height="42" rx="10" fill="#dcfce7" />
        <text x={width / 2} y="615" textAnchor="middle">
          {labels.globalOutput}
        </text>
      </svg>
    </div>
  );
}
