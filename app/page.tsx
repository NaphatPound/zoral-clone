import path from "node:path";
import Link from "next/link";
import GraphCanvas from "@/components/GraphCanvas";
import { loadSampleWorkflow } from "@/lib/sample";
import { readWorkflow } from "@/lib/workflow-store";
import type { Workflow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams?: { workflow?: string };
}) {
  const requestedId = searchParams?.workflow;
  let workflow: Workflow | null = null;
  if (requestedId) {
    workflow = await readWorkflow(requestedId);
  }
  if (!workflow) {
    workflow = loadSampleWorkflow(path.resolve(process.cwd()));
  }
  const loadedFromStore = Boolean(requestedId && workflow);
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(30, 41, 59, 0.45), transparent 35%), #0b1020",
      }}
    >
      <header
        className="fixed left-0 top-0 z-10 w-full border-b border-slate-700 bg-slate-950/80 px-4 py-2 backdrop-blur"
        style={{
          position: "fixed",
          inset: "0 0 auto 0",
          zIndex: 30,
          width: "100%",
          borderBottom: "1px solid rgba(51, 65, 85, 0.95)",
          background: "rgba(2, 6, 23, 0.84)",
          padding: "10px 16px",
          boxSizing: "border-box",
          backdropFilter: "blur(18px)",
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              className="text-sm font-semibold text-white"
              style={{ fontSize: 16, fontWeight: 700, color: "#ffffff" }}
            >
              Zoral Clone — {workflow.meta.runtimeName ?? "Workflow"}
            </div>
            <div
              className="text-[11px] text-slate-400"
              style={{ marginTop: 4, fontSize: 12, color: "#94a3b8" }}
            >
              {workflow.nodes.length} nodes · {workflow.edges.length} edges ·
              format {workflow.meta.formatVersion ?? "?"} rev{" "}
              {workflow.meta.revision ?? "?"}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 12,
              color: "#94a3b8",
            }}
          >
            <span style={{ maxWidth: 480 }}>
              {loadedFromStore
                ? `Loaded from store · id ${requestedId}`
                : "Low-code node graph — right-click to add nodes, connect boxes with handles, and AI-summarize into Markdown"}
            </span>
            <Link
              href="/workflows"
              style={{
                borderRadius: 8,
                border: "1px solid rgba(71, 85, 105, 0.95)",
                padding: "6px 12px",
                color: "#e2e8f0",
                fontSize: 12,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Workflows
            </Link>
          </div>
        </div>
      </header>
      <div className="pt-12" style={{ paddingTop: 88 }}>
        <GraphCanvas
          workflow={workflow}
          workflowId={loadedFromStore ? requestedId : undefined}
        />
      </div>
    </main>
  );
}
