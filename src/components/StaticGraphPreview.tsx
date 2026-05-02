"use client";
import type { CSSProperties } from "react";
import type { Workflow, WorkflowEdge, WorkflowNode, NodeKind } from "@/lib/types";

const NODE_WIDTH = 188;
const NODE_HEIGHT = 78;
const PADDING = 72;

const KIND_COLORS: Record<
  NodeKind,
  { fill: string; stroke: string; label: string; text: string; accent: string }
> = {
  start: {
    fill: "#065f46",
    stroke: "#34d399",
    label: "#bbf7d0",
    text: "#f0fdf4",
    accent: "#34d399",
  },
  end: {
    fill: "#7f1d1d",
    stroke: "#fb7185",
    label: "#fecdd3",
    text: "#fff1f2",
    accent: "#fb7185",
  },
  componentTask: {
    fill: "#075985",
    stroke: "#38bdf8",
    label: "#bae6fd",
    text: "#eff6ff",
    accent: "#38bdf8",
  },
  scriptTask: {
    fill: "#5b21b6",
    stroke: "#a78bfa",
    label: "#ddd6fe",
    text: "#f5f3ff",
    accent: "#a78bfa",
  },
  gateway: {
    fill: "#92400e",
    stroke: "#f59e0b",
    label: "#fef3c7",
    text: "#fffbeb",
    accent: "#f59e0b",
  },
  condition: {
    fill: "#f8fafc",
    stroke: "#cbd5e1",
    label: "#64748b",
    text: "#0f172a",
    accent: "#94a3b8",
  },
  graphqlQuery: {
    fill: "#115e59",
    stroke: "#2dd4bf",
    label: "#99f6e4",
    text: "#f0fdfa",
    accent: "#2dd4bf",
  },
  note: {
    fill: "#fde68a",
    stroke: "#f59e0b",
    label: "#92400e",
    text: "#1f2937",
    accent: "#f59e0b",
  },
  unknown: {
    fill: "#334155",
    stroke: "#94a3b8",
    label: "#cbd5e1",
    text: "#f8fafc",
    accent: "#94a3b8",
  },
};

type PositionedNode = WorkflowNode & { position: { x: number; y: number } };

function getNodePosition(node: WorkflowNode, index: number): { x: number; y: number } {
  if (node.position) return node.position;
  return {
    x: (index % 6) * (NODE_WIDTH + 36),
    y: Math.floor(index / 6) * (NODE_HEIGHT + 48),
  };
}

function firstMeaningfulLine(edge: WorkflowEdge): string {
  if (!edge.condition) return edge.label ?? "";
  const line = edge.condition
    .split("\n")
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) return edge.label ?? "condition";
  return line.length > 42 ? `${line.slice(0, 39)}...` : line;
}

function sourceAnchor(node: PositionedNode, edge: WorkflowEdge) {
  const x = node.position.x;
  const y = node.position.y;
  if (node.kind === "gateway" && edge.label === "else") {
    return { x: x + NODE_WIDTH / 2, y: y + NODE_HEIGHT };
  }
  if (edge.kind === "boundary") {
    return { x: x + NODE_WIDTH / 2, y: y + NODE_HEIGHT };
  }
  return { x: x + NODE_WIDTH, y: y + NODE_HEIGHT / 2 };
}

function targetAnchor(node: PositionedNode, edge: WorkflowEdge) {
  const x = node.position.x;
  const y = node.position.y;
  if (edge.kind === "boundary") {
    return { x: x + NODE_WIDTH / 2, y };
  }
  return { x, y: y + NODE_HEIGHT / 2 };
}

function edgePath(source: { x: number; y: number }, target: { x: number; y: number }) {
  const deltaX = Math.max(48, Math.abs(target.x - source.x) * 0.35);
  const direction = target.x >= source.x ? 1 : -1;
  return [
    `M ${source.x} ${source.y}`,
    `C ${source.x + deltaX * direction} ${source.y}`,
    `${target.x - deltaX * direction} ${target.y}`,
    `${target.x} ${target.y}`,
  ].join(" ");
}

function wrapNodeText(value: string, maxLength: number): string[] {
  const raw = value.trim() || "Untitled";
  const words = raw.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length <= maxLength) {
      current = `${current} ${word}`;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === 2) break;
  }

  if (lines.length < 2 && current) {
    lines.push(current);
  }

  if (lines.length === 0) return [raw.slice(0, maxLength)];
  const clipped = lines.slice(0, 2);
  const consumed = clipped.join(" ");
  if (consumed.length < raw.length) {
    const last = clipped[clipped.length - 1] ?? "";
    clipped[clipped.length - 1] =
      last.length > maxLength - 3 ? `${last.slice(0, maxLength - 3)}...` : `${last}...`;
  }
  return clipped;
}

function backgroundStyle(): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    overflow: "hidden",
    pointerEvents: "none",
    backgroundColor: "#0b1020",
    backgroundImage:
      "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.25) 1px, transparent 0)",
    backgroundPosition: "0 0",
    backgroundSize: "24px 24px",
  };
}

export default function StaticGraphPreview({ workflow }: { workflow: Workflow }) {
  const nodes: PositionedNode[] = workflow.nodes.map((node, index) => ({
    ...node,
    position: getNodePosition(node, index),
  }));
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const));

  let maxX = 0;
  let maxY = 0;
  for (const node of nodes) {
    maxX = Math.max(maxX, node.position.x + NODE_WIDTH);
    maxY = Math.max(maxY, node.position.y + NODE_HEIGHT);
  }

  const width = Math.max(960, maxX + PADDING * 2);
  const height = Math.max(540, maxY + PADDING * 2);

  return (
    <div aria-hidden="true" style={backgroundStyle()}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <defs>
          <filter id="static-graph-shadow" x="-20%" y="-20%" width="160%" height="160%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="rgba(15,23,42,0.35)" />
          </filter>
        </defs>
        <g transform={`translate(${PADDING}, ${PADDING})`}>
          {workflow.edges.map((edge) => {
            const sourceNode = nodesById.get(edge.source);
            const targetNode = nodesById.get(edge.target);
            if (!sourceNode || !targetNode) return null;
            const start = sourceAnchor(sourceNode, edge);
            const end = targetAnchor(targetNode, edge);
            const label = firstMeaningfulLine(edge);
            const labelX = (start.x + end.x) / 2;
            const labelY = (start.y + end.y) / 2;

            return (
              <g key={edge.id}>
                <path
                  d={edgePath(start, end)}
                  fill="none"
                  stroke={edge.kind === "boundary" ? "#ef4444" : "rgba(148,163,184,0.78)"}
                  strokeWidth={edge.kind === "boundary" ? 2.25 : 2}
                  strokeDasharray={edge.kind === "boundary" ? "7 6" : undefined}
                  strokeLinecap="round"
                />
                {label ? (
                  <>
                    <rect
                      x={labelX - 44}
                      y={labelY - 12}
                      width="88"
                      height="24"
                      rx="6"
                      fill="rgba(255,255,255,0.96)"
                      stroke={edge.kind === "boundary" ? "#fda4af" : "#cbd5e1"}
                    />
                    <text
                      x={labelX}
                      y={labelY + 4}
                      textAnchor="middle"
                      fontSize="10"
                      fontFamily="ui-sans-serif, system-ui, sans-serif"
                      fill="#0f172a"
                    >
                      {label}
                    </text>
                  </>
                ) : null}
              </g>
            );
          })}
          {nodes.map((node) => {
            const palette = KIND_COLORS[node.kind] ?? KIND_COLORS.unknown;
            const nameLines = wrapNodeText(node.name || node.id, 22);
            const subline = node.componentName ? `component: ${node.componentName}` : undefined;
            const boundaryCount = node.boundaryEvents.length;

            return (
              <g
                key={node.id}
                transform={`translate(${node.position.x}, ${node.position.y})`}
                filter="url(#static-graph-shadow)"
              >
                <rect
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx="12"
                  fill={palette.fill}
                  stroke={palette.stroke}
                  strokeWidth="2"
                />
                <text
                  x="14"
                  y="18"
                  fontSize="10"
                  letterSpacing="1.2"
                  fontWeight="700"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                  fill={palette.label}
                >
                  {node.tag.toUpperCase()}
                </text>
                <text
                  x="14"
                  y="36"
                  fontSize="13"
                  fontWeight="700"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                  fill={palette.text}
                >
                  {nameLines.map((line, index) => (
                    <tspan key={`${node.id}-${index}`} x="14" dy={index === 0 ? 0 : 15}>
                      {line}
                    </tspan>
                  ))}
                </text>
                {subline ? (
                  <text
                    x="14"
                    y="62"
                    fontSize="10"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    fill={palette.label}
                  >
                    {subline.length > 26 ? `${subline.slice(0, 23)}...` : subline}
                  </text>
                ) : null}
                {boundaryCount > 0 ? (
                  <>
                    <circle cx={NODE_WIDTH - 18} cy="18" r="8" fill={palette.accent} />
                    <text
                      x={NODE_WIDTH - 18}
                      y="21"
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="700"
                      fontFamily="ui-sans-serif, system-ui, sans-serif"
                      fill="#ffffff"
                    >
                      {boundaryCount}
                    </text>
                  </>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
