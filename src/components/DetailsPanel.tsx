"use client";
import type { WorkflowEdge, WorkflowNode } from "@/lib/types";

interface DetailsPanelProps {
  node: WorkflowNode | null;
  edge: WorkflowEdge | null;
  onNodeChange: (
    patch: Partial<
      Pick<
        WorkflowNode,
        "name" | "description" | "componentName" | "script" | "processOutputScript"
      >
    >,
  ) => void;
  onEdgeChange: (
    patch: Partial<Pick<WorkflowEdge, "label" | "condition">>,
  ) => void;
}

function optionalValue(value: string): string | undefined {
  return value === "" ? undefined : value;
}

export default function DetailsPanel({
  node,
  edge,
  onNodeChange,
  onEdgeChange,
}: DetailsPanelProps) {
  if (!node && !edge) {
    return (
      <div
        className="flex h-full items-center justify-center p-4 text-sm text-slate-400"
        style={{
          display: "flex",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          color: "#94a3b8",
          fontSize: 16,
          lineHeight: 1.6,
        }}
      >
        Right-click the canvas to add a node. Select a node or condition box
        to edit it, drag boxes on the canvas to reposition them, or open AI
        Assistant to generate workflow documentation.
      </div>
    );
  }

  if (edge) {
    const edgePayload = {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      kind: edge.kind,
      label: edge.label,
      condition: edge.condition,
      labelOffset: edge.labelOffset,
    };

    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-slate-700 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">
            Workflow Edge
          </div>
          <div className="text-sm font-semibold text-white">
            {edge.label ?? "condition"}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {edge.source} → {edge.target}
          </div>
        </div>
        <div className="flex-1 space-y-4 overflow-auto p-4">
          <section>
            <h3 className="mb-3 text-xs uppercase text-slate-400">
              Editable Fields
            </h3>
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-400">
                  Label
                </span>
                <input
                  type="text"
                  value={edge.label ?? ""}
                  onChange={(e) =>
                    onEdgeChange({ label: optionalValue(e.target.value) })
                  }
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-400">
                  Condition
                </span>
                <textarea
                  value={edge.condition ?? ""}
                  onChange={(e) =>
                    onEdgeChange({ condition: optionalValue(e.target.value) })
                  }
                  rows={10}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-sky-400"
                />
              </label>
            </div>
          </section>
          <section>
            <h3 className="mb-1 text-xs uppercase text-slate-400">JSON</h3>
            <pre className="whitespace-pre-wrap break-words rounded bg-slate-900 p-2 text-[11px] text-slate-200">
              {JSON.stringify(edgePayload, null, 2)}
            </pre>
          </section>
        </div>
      </div>
    );
  }

  const activeNode = node;
  const showComponentName =
    activeNode!.kind === "componentTask" || activeNode!.componentName !== undefined;
  const showScript =
    activeNode!.kind === "scriptTask" || activeNode!.script !== undefined;
  const showProcessOutput =
    activeNode!.kind === "componentTask" ||
    activeNode!.processOutputScript !== undefined;

  const payload = {
    id: activeNode!.id,
    tag: activeNode!.tag,
    kind: activeNode!.kind,
    name: activeNode!.name,
    description: activeNode!.description,
    nextId: activeNode!.nextId,
    componentName: activeNode!.componentName,
    boundaryEvents: activeNode!.boundaryEvents,
    position: activeNode!.position,
    attributes: activeNode!.attributes,
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-slate-700 px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-400">
          {activeNode!.tag}
        </div>
        <div className="text-sm font-semibold text-white">
          {activeNode!.name || activeNode!.id}
        </div>
        <div className="mt-1 text-[11px] text-slate-400">
          {activeNode!.kind} · id {activeNode!.id}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-4">
        <section>
          <h3 className="mb-3 text-xs uppercase text-slate-400">Editable Fields</h3>
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[11px] uppercase tracking-wider text-slate-400">
                Name
              </span>
              <input
                type="text"
                value={activeNode!.name}
                onChange={(e) => onNodeChange({ name: e.target.value })}
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] uppercase tracking-wider text-slate-400">
                Description
              </span>
              <textarea
                value={activeNode!.description ?? ""}
                onChange={(e) =>
                  onNodeChange({ description: optionalValue(e.target.value) })
                }
                rows={3}
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400"
              />
            </label>
            {showComponentName ? (
              <label className="block space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-400">
                  Component Name
                </span>
                <input
                  type="text"
                  value={activeNode!.componentName ?? ""}
                  onChange={(e) =>
                    onNodeChange({
                      componentName: optionalValue(e.target.value),
                    })
                  }
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400"
                />
              </label>
            ) : null}
            {showScript ? (
              <label className="block space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-400">
                  Script
                </span>
                <textarea
                  value={activeNode!.script ?? ""}
                  onChange={(e) =>
                    onNodeChange({ script: optionalValue(e.target.value) })
                  }
                  rows={8}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-emerald-200 outline-none focus:border-sky-400"
                />
              </label>
            ) : null}
            {showProcessOutput ? (
              <label className="block space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-400">
                  Process Output Script
                </span>
                <textarea
                  value={activeNode!.processOutputScript ?? ""}
                  onChange={(e) =>
                    onNodeChange({
                      processOutputScript: optionalValue(e.target.value),
                    })
                  }
                  rows={6}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-amber-200 outline-none focus:border-sky-400"
                />
              </label>
            ) : null}
          </div>
        </section>
        <section>
          <h3 className="mb-1 text-xs uppercase text-slate-400">JSON</h3>
          <pre className="whitespace-pre-wrap break-words rounded bg-slate-900 p-2 text-[11px] text-slate-200">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </section>
      </div>
    </div>
  );
}
