"use client";

type DemoNode = { id: string; name: string; color: string; x: number; y: number };
type DemoEdge = { from: string; to: string; label: string; color: string; dashed?: boolean };

const NODES: DemoNode[] = [
  { id: "1", name: "Alex",   color: "#ff8f84", x: 320, y: 130 },
  { id: "2", name: "Sam",    color: "#a78bfa", x: 540, y: 68  },
  { id: "3", name: "Jordan", color: "#66b6a7", x: 100, y: 240 },
  { id: "4", name: "Riley",  color: "#ffd08d", x: 510, y: 248 },
  { id: "5", name: "Morgan", color: "#fb923c", x: 702, y: 138 },
  { id: "6", name: "Casey",  color: "#f472b6", x: 252, y: 330 },
  { id: "7", name: "Drew",   color: "#63b1ff", x: 658, y: 318 },
];

const EDGES: DemoEdge[] = [
  { from: "1", to: "2", label: "Dating 💕",    color: "#f472b6" },
  { from: "1", to: "3", label: "Friends",       color: "#66b6a7" },
  { from: "2", to: "5", label: "Exes 💔",       color: "#ff8f84" },
  { from: "3", to: "6", label: "Friends",       color: "#66b6a7" },
  { from: "4", to: "6", label: "Situationship", color: "#fb923c" },
  { from: "4", to: "7", label: "Talking",       color: "#a78bfa" },
  { from: "5", to: "7", label: "Friends",       color: "#66b6a7" },
  { from: "1", to: "4", label: "Complicated",   color: "#7aa2ff", dashed: true },
];

const LABEL_PADDING_X = 10;
const LABEL_HEIGHT = 18;

function estimateLabelWidth(label: string) {
  // emojis count as ~2 chars width
  const chars = [...label].reduce((acc, ch) => acc + (/\p{Emoji}/u.test(ch) && ch.codePointAt(0)! > 0x2fff ? 2 : 1), 0);
  return Math.max(chars * 6.2 + LABEL_PADDING_X * 2, 56);
}

export function DemoGraph() {
  const nodeMap = new Map(NODES.map((n) => [n.id, n]));

  return (
    <div
      className="overflow-hidden rounded-2xl border border-[var(--border-soft)]"
      style={{ background: "#110820" }}
    >
      <svg
        viewBox="0 0 820 420"
        className="h-auto w-full"
        style={{ maxHeight: 420, display: "block" }}
        aria-label="Example connection network showing people and their relationship types"
      >
        <defs>
          <pattern id="demo-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="12" cy="12" r="1" fill="rgba(255,255,255,0.07)" />
          </pattern>
          {NODES.map((n) => (
            <radialGradient key={`grad-${n.id}`} id={`node-grad-${n.id}`} cx="40%" cy="35%" r="60%">
              <stop offset="0%" stopColor={n.color} stopOpacity="1" />
              <stop offset="100%" stopColor={n.color} stopOpacity="0.75" />
            </radialGradient>
          ))}
        </defs>

        {/* Dot background */}
        <rect width="820" height="420" fill="url(#demo-dots)" />

        {/* Edges — rendered first so nodes sit on top */}
        <g>
          {EDGES.map((edge) => {
            const src = nodeMap.get(edge.from);
            const tgt = nodeMap.get(edge.to);
            if (!src || !tgt) return null;
            const mx = (src.x + tgt.x) / 2;
            const my = (src.y + tgt.y) / 2;
            const lw = estimateLabelWidth(edge.label);
            return (
              <g key={`edge-${edge.from}-${edge.to}`}>
                <line
                  x1={src.x}
                  y1={src.y}
                  x2={tgt.x}
                  y2={tgt.y}
                  stroke={edge.color}
                  strokeWidth="2"
                  strokeOpacity="0.65"
                  strokeDasharray={edge.dashed ? "6 4" : undefined}
                />
                {/* Label background */}
                <rect
                  x={mx - lw / 2}
                  y={my - LABEL_HEIGHT / 2}
                  width={lw}
                  height={LABEL_HEIGHT}
                  rx="5"
                  ry="5"
                  fill="rgba(10,6,20,0.82)"
                  stroke={edge.color}
                  strokeWidth="0.75"
                  strokeOpacity="0.5"
                />
                <text
                  x={mx}
                  y={my + 5}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill={edge.color}
                  fontFamily="system-ui, sans-serif"
                >
                  {edge.label}
                </text>
              </g>
            );
          })}
        </g>

        {/* Nodes */}
        {NODES.map((node) => (
          <g key={`node-${node.id}`} className="demo-node-group">
            {/* Outer glow ring */}
            <circle cx={node.x} cy={node.y} r="30" fill={node.color} fillOpacity="0.12" />
            {/* Hover glow — grows on hover via CSS */}
            <circle
              cx={node.x}
              cy={node.y}
              r="26"
              fill={node.color}
              fillOpacity="0.18"
              className="demo-node-halo"
            />
            {/* Main circle */}
            <circle
              cx={node.x}
              cy={node.y}
              r="22"
              fill={`url(#node-grad-${node.id})`}
              className="demo-node-circle"
              style={{ filter: `drop-shadow(0 4px 12px ${node.color}55)` }}
            />
            {/* Initial */}
            <text
              x={node.x}
              y={node.y + 5}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill="white"
              fontFamily="system-ui, sans-serif"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {node.name[0]}
            </text>
            {/* Name pill */}
            <rect
              x={node.x - 26}
              y={node.y + 27}
              width="52"
              height="17"
              rx="8"
              ry="8"
              fill="rgba(0,0,0,0.55)"
            />
            <text
              x={node.x}
              y={node.y + 39}
              textAnchor="middle"
              fontSize="10"
              fontWeight="600"
              fill="rgba(255,255,255,0.88)"
              fontFamily="system-ui, sans-serif"
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {node.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
