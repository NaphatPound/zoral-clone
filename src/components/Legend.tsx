"use client";
import type { NodeKind } from "@/lib/types";

const ENTRIES: { kind: NodeKind; label: string; className: string }[] = [
  { kind: "start", label: "Start", className: "bg-emerald-600" },
  { kind: "end", label: "End", className: "bg-rose-600" },
  { kind: "componentTask", label: "Component task", className: "bg-sky-700" },
  { kind: "scriptTask", label: "Script task", className: "bg-violet-700" },
  { kind: "gateway", label: "Gateway", className: "bg-amber-600" },
  { kind: "condition", label: "Condition (if/else)", className: "bg-slate-100" },
  { kind: "graphqlQuery", label: "GraphQL query (ADW)", className: "bg-teal-700" },
  { kind: "unknown", label: "Unknown", className: "bg-slate-700" },
];

const KIND_DOT_COLORS: Record<NodeKind, string> = {
  start: "#059669",
  end: "#e11d48",
  componentTask: "#0369a1",
  scriptTask: "#7c3aed",
  gateway: "#d97706",
  condition: "#f8fafc",
  graphqlQuery: "#0f766e",
  unknown: "#475569",
};

export default function Legend() {
  return (
    <div
      className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-md border border-slate-700 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-200 backdrop-blur"
      style={{
        position: "absolute",
        left: 16,
        bottom: 16,
        zIndex: 20,
        borderRadius: 12,
        border: "1px solid rgba(51, 65, 85, 0.95)",
        background: "rgba(2, 6, 23, 0.82)",
        padding: "12px 14px",
        color: "#e2e8f0",
        backdropFilter: "blur(18px)",
      }}
    >
      <div
        className="mb-1 font-semibold uppercase tracking-wider text-slate-400"
        style={{
          marginBottom: 8,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#94a3b8",
        }}
      >
        Node kinds
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {ENTRIES.map((e) => (
          <li
            key={e.kind}
            className="flex items-center gap-2"
            style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}
          >
            <span
              className={`inline-block h-3 w-3 rounded ${e.className}`}
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                borderRadius: 999,
                background: KIND_DOT_COLORS[e.kind],
              }}
            />
            <span style={{ fontSize: 12 }}>{e.label}</span>
          </li>
        ))}
        <li
          className="mt-1 flex items-center gap-2 border-t border-slate-700 pt-1"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px solid rgba(51, 65, 85, 0.95)",
          }}
        >
          <span
            className="inline-block h-[2px] w-4 bg-rose-500"
            style={{ display: "inline-block", width: 16, height: 2, background: "#f43f5e" }}
          />
          <span style={{ fontSize: 12 }}>Boundary error</span>
        </li>
      </ul>
    </div>
  );
}
