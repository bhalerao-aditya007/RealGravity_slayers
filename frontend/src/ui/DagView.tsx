import { useMemo, useState } from 'react';
import dagre from '@dagrejs/dagre';
import { useStore } from '@/state/store';
import { TASK_STATUS_COLORS } from '@/config/office';
import { cameraCtl } from '@/three/cameraCtl';
import { director } from '@/sim/director';

export function DagView() {
  const tasks = useStore((s) => s.tasks);
  const edges = useStore((s) => s.edges);
  const agents = useStore((s) => s.agents);
  const [sel, setSel] = useState<string | null>(null);

  const NODE_W = 160;
  const NODE_H = 52;

  const layout = useMemo(() => {
    const ids = Object.keys(tasks);
    if (!ids.length) return null;
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', nodesep: 20, ranksep: 36, marginx: 16, marginy: 16 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const id of ids) g.setNode(id, { width: NODE_W, height: NODE_H });
    for (const e of edges) if (tasks[e.from] && tasks[e.to]) g.setEdge(e.from, e.to);
    dagre.layout(g);
    return g;
  }, [tasks, edges]);

  if (!layout) {
    return (
      <div className="p-8 text-center text-xs font-body text-ink/50 flex flex-col items-center justify-center gap-2">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
        <span>Waiting for manager to decompose goal into task DAG...</span>
      </div>
    );
  }

  const nodes = Object.keys(tasks).map((id) => ({
    id,
    n: layout.node(id) as any,
    t: tasks[id],
  }));

  const maxX = Math.max(...nodes.map((x) => x.n.x + NODE_W / 2 + 20), 300);
  const maxY = Math.max(...nodes.map((x) => x.n.y + NODE_H / 2 + 20), 200);

  return (
    <div className="overflow-auto h-full p-2 relative select-none">
      <svg width={maxX} height={maxY} className="mx-auto block">
        <defs>
          <filter id="dag-shadow" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.06" />
          </filter>
          <linearGradient id="active-line-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* Curved Connection Edges */}
        {edges.map((e, i) => {
          const fromNode = layout.node(e.from) as any;
          const toNode = layout.node(e.to) as any;
          if (!fromNode || !toNode) return null;

          const x1 = fromNode.x;
          const y1 = fromNode.y + NODE_H / 2;
          const x2 = toNode.x;
          const y2 = toNode.y - NODE_H / 2;
          const midY = (y1 + y2) / 2;

          const pathD = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

          const fromDone = tasks[e.from]?.status === 'done';
          const toRunning = tasks[e.to]?.status === 'running';
          const active = fromDone && toRunning;

          return (
            <g key={i}>
              <path
                d={pathD}
                fill="none"
                stroke={active ? 'url(#active-line-grad)' : fromDone ? 'rgba(43,43,46,0.3)' : 'rgba(43,43,46,0.12)'}
                strokeWidth={active ? 2.4 : 1.5}
                strokeDasharray={fromDone ? undefined : '4 3'}
              />
              {active && (
                <circle r="3" fill="#10b981">
                  <animateMotion path={pathD} dur="1.8s" repeatCount="indefinite" />
                </circle>
              )}
            </g>
          );
        })}

        {/* Node Cards */}
        {nodes.map(({ id, n, t }) => {
          const isSel = sel === id;
          const isDone = t.status === 'done';
          const isRunning = t.status === 'running';
          const assignedAgent = t.assigned_agent ? agents[t.assigned_agent] : null;
          const statusColor = TASK_STATUS_COLORS[t.status] ?? '#999';

          const cardX = n.x - NODE_W / 2;
          const cardY = n.y - NODE_H / 2;

          return (
            <g
              key={id}
              transform={`translate(${cardX}, ${cardY})`}
              onClick={() => {
                setSel(id);
                if (t.assigned_agent) {
                  const rt = director.rt(t.assigned_agent);
                  if (rt) cameraCtl.flyTo([rt.x + 8, 7, rt.z + 8], [rt.x, 1, rt.z]);
                }
              }}
              className="cursor-pointer group"
            >
              {/* Card Container */}
              <rect
                width={NODE_W}
                height={NODE_H}
                rx="10"
                fill={isSel ? '#FFFFFF' : '#FAF7F2'}
                stroke={isRunning ? 'var(--accent)' : isDone ? '#10b981' : 'rgba(43,43,46,0.15)'}
                strokeWidth={isRunning ? '2' : isSel ? '1.8' : '1.2'}
                filter="url(#dag-shadow)"
              />

              {/* Status Indicator Pill */}
              <rect
                x="8"
                y="8"
                width="16"
                height="14"
                rx="4"
                fill="rgba(43,43,46,0.06)"
              />
              <text
                x="16"
                y="18.5"
                textAnchor="middle"
                fontSize="9"
                fontWeight="600"
                fontFamily="JetBrains Mono, monospace"
                fill="#2B2B2E"
                opacity="0.75"
              >
                {id}
              </text>

              {/* Status Badge */}
              <circle cx="34" cy="15" r="3" fill={statusColor} />
              <text
                x="41"
                y="18"
                fontSize="9"
                fontWeight="600"
                fontFamily="JetBrains Mono, monospace"
                fill={statusColor}
                letterSpacing="0.05em"
              >
                {t.status.toUpperCase()}
              </text>

              {/* Assigned Agent Tag */}
              {assignedAgent && (
                <text
                  x={NODE_W - 8}
                  y="18"
                  textAnchor="end"
                  fontSize="8.5"
                  fontFamily="Inter, sans-serif"
                  fill="#2B2B2E"
                  opacity="0.5"
                >
                  {assignedAgent.name}
                </text>
              )}

              {/* Task Description */}
              <text
                x="10"
                y="33"
                fontSize="10"
                fontWeight="500"
                fontFamily="Inter, sans-serif"
                fill="#2B2B2E"
              >
                {t.description.length > 24 ? t.description.slice(0, 23) + '...' : t.description}
              </text>

              {/* Progress Bar Track & Fill */}
              <rect
                x="10"
                y="41"
                width={NODE_W - 20}
                height="3.5"
                rx="1.75"
                fill="rgba(43,43,46,0.08)"
              />
              <rect
                x="10"
                y="41"
                width={Math.max(2, ((t.progress_pct ?? (isDone ? 100 : 0)) / 100) * (NODE_W - 20))}
                height="3.5"
                rx="1.75"
                fill={isDone ? '#10b981' : isRunning ? 'var(--accent)' : statusColor}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
