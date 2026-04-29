"use client";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "reactflow";
import type { WorkflowEdge as WorkflowEdgeModel } from "@/lib/types";

export interface FlowEdgeData {
  edge: WorkflowEdgeModel;
  onSelect?: (edgeId: string) => void;
  onChange?: (
    edgeId: string,
    patch: Partial<Pick<WorkflowEdgeModel, "label" | "condition" | "labelOffset">>,
  ) => void;
}

const CONDITION_PREVIEW_MAX = 28;

function summarizeCondition(edge: WorkflowEdgeModel): string {
  if (!edge.condition) {
    return edge.label ?? "";
  }
  const line = edge.condition
    .split("\n")
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) return edge.label ?? "condition";
  return line.length > CONDITION_PREVIEW_MAX
    ? `${line.slice(0, CONDITION_PREVIEW_MAX - 1)}…`
    : line;
}

export default function WorkflowEdge({
  id,
  data,
  selected,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerStart,
  markerEnd,
  interactionWidth,
}: EdgeProps<FlowEdgeData>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edge = data?.edge;
  const hasLabel = Boolean(edge?.label || edge?.condition);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerStart={markerStart}
        markerEnd={markerEnd}
        interactionWidth={interactionWidth}
      />
      {hasLabel ? (
        <EdgeLabelRenderer>
          <div
            className={`nodrag nopan absolute rounded-md border px-2 py-1 shadow-sm ${
              selected
                ? "border-sky-500 bg-sky-50"
                : "border-slate-300 bg-white/95"
            }`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
              cursor: "pointer",
              position: "absolute",
              borderRadius: 8,
              border: `1px solid ${selected ? "#0ea5e9" : "#cbd5e1"}`,
              background: selected ? "#e0f2fe" : "rgba(255,255,255,0.96)",
              padding: "4px 8px",
              boxShadow: "0 8px 16px rgba(15, 23, 42, 0.12)",
            }}
            onClick={(event) => {
              event.stopPropagation();
              data?.onSelect?.(id);
            }}
          >
            {edge?.condition ? (
              <div
                className="mb-1 text-[9px] uppercase tracking-[0.18em] text-slate-500"
                style={{
                  marginBottom: 4,
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  color: "#64748b",
                }}
              >
                {edge.label ?? "condition"}
              </div>
            ) : null}
            <div
              className="max-w-[180px] truncate text-[11px] leading-tight text-slate-800"
              style={{
                maxWidth: 180,
                fontSize: 11,
                lineHeight: 1.25,
                color: "#0f172a",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={edge?.condition ?? edge?.label ?? ""}
            >
              {edge ? summarizeCondition(edge) : ""}
            </div>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
