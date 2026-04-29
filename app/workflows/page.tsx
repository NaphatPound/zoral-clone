import Link from "next/link";
import { listWorkflowSummaries } from "@/lib/workflow-store";

export const dynamic = "force-dynamic";

export default async function WorkflowsListPage() {
  const items = await listWorkflowSummaries();

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(30, 41, 59, 0.45), transparent 35%), #0b1020",
        color: "#e2e8f0",
        padding: "32px 40px",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.01em",
            }}
          >
            Saved Workflows
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: "#94a3b8" }}>
            {items.length === 0
              ? "Nothing saved yet — open a workflow on the canvas and click Save."
              : `${items.length} workflow${items.length === 1 ? "" : "s"} on disk.`}
          </div>
        </div>
        <Link
          href="/"
          style={{
            borderRadius: 8,
            border: "1px solid #38bdf8",
            background: "#0284c7",
            padding: "9px 14px",
            color: "#ffffff",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          ← Back to canvas
        </Link>
      </header>

      {items.length === 0 ? (
        <div
          style={{
            border: "1px dashed rgba(71, 85, 105, 0.95)",
            borderRadius: 12,
            padding: "32px 24px",
            color: "#94a3b8",
            textAlign: "center",
          }}
        >
          No saved workflows.
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 12,
          }}
        >
          {items.map((item) => (
            <li
              key={item.id}
              style={{
                border: "1px solid rgba(51, 65, 85, 0.95)",
                borderRadius: 12,
                background: "rgba(15, 23, 42, 0.85)",
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#ffffff",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={item.runtimeName ?? item.id}
                >
                  {item.runtimeName ?? item.id}
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 11,
                    color: "#64748b",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={item.id}
                >
                  {item.id}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                {item.nodeCount} nodes · {item.edgeCount} edges
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                Saved {new Date(item.modifiedAt).toLocaleString()}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <Link
                  href={`/?workflow=${encodeURIComponent(item.id)}`}
                  style={{
                    borderRadius: 6,
                    border: "1px solid #38bdf8",
                    background: "#0284c7",
                    padding: "6px 12px",
                    color: "#ffffff",
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Open
                </Link>
                <a
                  href={`/api/workflows/${encodeURIComponent(item.id)}`}
                  style={{
                    borderRadius: 6,
                    border: "1px solid rgba(71, 85, 105, 0.95)",
                    padding: "6px 12px",
                    color: "#cbd5e1",
                    fontSize: 12,
                    textDecoration: "none",
                  }}
                >
                  Raw JSON
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
