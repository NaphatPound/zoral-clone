"use client";
import { Handle, Position } from "reactflow";
import type { NodeKind, WorkflowNode } from "@/lib/types";

const KIND_COLORS: Record<NodeKind, string> = {
  start: "bg-emerald-600 border-emerald-400",
  end: "bg-rose-600 border-rose-400",
  componentTask: "bg-sky-700 border-sky-400",
  scriptTask: "bg-violet-700 border-violet-400",
  gateway: "bg-amber-600 border-amber-400",
  condition: "bg-slate-100 border-slate-300",
  unknown: "bg-slate-700 border-slate-500",
};

const KIND_STYLES: Record<NodeKind, { background: string; borderColor: string; color: string }> = {
  start: { background: "#059669", borderColor: "#34d399", color: "#ffffff" },
  end: { background: "#e11d48", borderColor: "#fb7185", color: "#ffffff" },
  componentTask: { background: "#0369a1", borderColor: "#38bdf8", color: "#ffffff" },
  scriptTask: { background: "#7c3aed", borderColor: "#a78bfa", color: "#ffffff" },
  gateway: { background: "#d97706", borderColor: "#f59e0b", color: "#ffffff" },
  condition: { background: "#f8fafc", borderColor: "#cbd5e1", color: "#0f172a" },
  unknown: { background: "#475569", borderColor: "#94a3b8", color: "#ffffff" },
};

type RunStatus = "ok" | "skipped" | "error";

interface NodeCardData {
  label: string;
  node: WorkflowNode;
  dim?: boolean;
  runStatus?: RunStatus;
}

const RUN_STATUS_RING: Record<RunStatus, string> = {
  ok: "0 0 0 3px rgba(34,197,94,0.65)",
  skipped: "0 0 0 3px rgba(250,204,21,0.65)",
  error: "0 0 0 3px rgba(248,113,113,0.7)",
};

const RUN_STATUS_BADGE: Record<RunStatus, { background: string; label: string }> = {
  ok: { background: "#22c55e", label: "ok" },
  skipped: { background: "#facc15", label: "skipped" },
  error: { background: "#f87171", label: "error" },
};

const HANDLE_STYLE = {
  width: 14,
  height: 14,
  background: "#0f172a",
  border: "2px solid #e2e8f0",
};

function HandlesForKind(_props: { kind: NodeKind }) {
  // Every node — including gateway, condition, start, and end — exposes a
  // single target on the left and a single source on the right so any node
  // can be wired up like a simple box. Branch semantics now live on the
  // condition nodes themselves.
  return (
    <>
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
    </>
  );
}

export default function NodeCard({ data }: { data: NodeCardData }) {
  const { node, dim, runStatus } = data;
  const color = KIND_COLORS[node.kind] ?? KIND_COLORS.unknown;
  const inlineStyle = KIND_STYLES[node.kind] ?? KIND_STYLES.unknown;
  const runRing = runStatus ? RUN_STATUS_RING[runStatus] : null;
  const isCondition = node.kind === "condition";
  const conditionPreview =
    isCondition && node.description
      ? node.description
          .split("\n")
          .map((part) => part.trim())
          .find(Boolean)
      : undefined;
  return (
    <div
      className={`rounded-lg border px-3 py-2 shadow-lg transition-opacity ${color} ${
        dim ? "opacity-25" : "opacity-100"
      }`}
      style={{
        minWidth: isCondition ? 140 : 180,
        maxWidth: isCondition ? 240 : undefined,
        borderRadius: 12,
        border: `1px solid ${inlineStyle.borderColor}`,
        background: inlineStyle.background,
        padding: isCondition ? "6px 10px" : "10px 12px",
        color: inlineStyle.color,
        boxShadow: runRing
          ? `${runRing}, 0 12px 24px rgba(15, 23, 42, 0.28)`
          : "0 12px 24px rgba(15, 23, 42, 0.28)",
        opacity: dim ? 0.25 : 1,
        position: "relative",
      }}
    >
      <HandlesForKind kind={node.kind} />
      {runStatus ? (
        <div
          style={{
            position: "absolute",
            top: -10,
            right: -8,
            background: RUN_STATUS_BADGE[runStatus].background,
            color: "#0f172a",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.06em",
            padding: "2px 6px",
            borderRadius: 999,
            boxShadow: "0 2px 6px rgba(15,23,42,0.45)",
          }}
        >
          {RUN_STATUS_BADGE[runStatus].label}
        </div>
      ) : null}
      <div
        className="text-[10px] uppercase tracking-wider opacity-75"
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          opacity: isCondition ? 0.6 : 0.8,
          color: inlineStyle.color,
        }}
      >
        {node.tag}
      </div>
      <div
        className="font-semibold leading-tight"
        style={{
          marginTop: 4,
          fontSize: isCondition ? 12 : 14,
          fontWeight: 700,
          lineHeight: 1.25,
          color: inlineStyle.color,
        }}
      >
        {node.name || node.id}
      </div>
      {conditionPreview ? (
        <div
          style={{
            marginTop: 4,
            fontSize: 10,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            color: "#475569",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 220,
          }}
          title={node.description}
        >
          {conditionPreview}
        </div>
      ) : null}
      {!isCondition && node.componentName ? (
        <div className="mt-1 text-[11px] opacity-80" style={{ marginTop: 6, fontSize: 11, opacity: 0.82 }}>
          component: {node.componentName}
        </div>
      ) : null}
      {!isCondition && node.boundaryEvents.length > 0 ? (
        <div
          className="mt-1 text-[11px] text-rose-100"
          style={{ marginTop: 6, fontSize: 11, color: "#ffe4e6" }}
        >
          ⚠ {node.boundaryEvents.length} boundary
        </div>
      ) : null}
    </div>
  );
}
