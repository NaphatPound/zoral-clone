import Link from "next/link";
import { headers } from "next/headers";
import { listWorkflowSummaries } from "@/lib/workflow-store";
import { readWorkspaceConfig } from "@/lib/workspace";
import TryRunPanel from "./TryRunPanel";

export const dynamic = "force-dynamic";

function CodeBlock({ children }: { children: string }) {
  return (
    <pre
      style={{
        background: "#020617",
        color: "#e2e8f0",
        border: "1px solid rgba(71,85,105,0.95)",
        borderRadius: 8,
        padding: 12,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 12,
        lineHeight: 1.5,
        whiteSpace: "pre",
        overflow: "auto",
      }}
    >
      {children}
    </pre>
  );
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "#38bdf8",
          marginBottom: 12,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function EndpointBox({
  method,
  path,
  children,
}: {
  method: string;
  path: string;
  children: React.ReactNode;
}) {
  const palette: Record<string, { bg: string; border: string }> = {
    GET: { bg: "#0e7490", border: "#22d3ee" },
    POST: { bg: "#059669", border: "#34d399" },
    DELETE: { bg: "#b91c1c", border: "#fb7185" },
  };
  const { bg, border } = palette[method] ?? { bg: "#475569", border: "#94a3b8" };
  return (
    <div
      style={{
        border: "1px solid rgba(71,85,105,0.95)",
        borderRadius: 12,
        padding: 16,
        background: "rgba(15,23,42,0.55)",
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span
          style={{
            background: bg,
            border: `1px solid ${border}`,
            color: "#ffffff",
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 10px",
            borderRadius: 6,
            letterSpacing: "0.06em",
          }}
        >
          {method}
        </span>
        <code style={{ fontSize: 14, color: "#e2e8f0" }}>{path}</code>
      </div>
      <div style={{ marginTop: 10, fontSize: 13, color: "#cbd5e1", lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  );
}

export default async function DocsPage() {
  const [items, workspace, hdrs] = await Promise.all([
    listWorkflowSummaries(),
    readWorkspaceConfig(),
    headers(),
  ]);
  const host = hdrs.get("host") ?? "localhost:3002";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${proto}://${host}`;
  const sample = items[0]?.id ?? "simple-add-demo";

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "32px 40px",
        color: "#e2e8f0",
        background:
          "radial-gradient(circle at top left, rgba(30, 41, 59, 0.45), transparent 35%), #0b1020",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: "#38bdf8", letterSpacing: "0.18em", textTransform: "uppercase" }}>
            API Reference
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#ffffff", marginTop: 4 }}>
            Zoral Clone Workflow API
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#94a3b8" }}>
            Base URL <code style={{ color: "#cbd5e1" }}>{baseUrl}</code> · Workspace{" "}
            <code style={{ color: "#cbd5e1" }}>{workspace.active}</code> · {items.length} workflow
            {items.length === 1 ? "" : "s"} available
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/api/openapi.json"
            style={{
              borderRadius: 8,
              border: "1px solid #34d399",
              background: "#059669",
              padding: "9px 14px",
              color: "#ffffff",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            OpenAPI JSON
          </Link>
          <Link
            href="/workflows"
            style={{
              borderRadius: 8,
              border: "1px solid rgba(100,116,139,0.95)",
              padding: "9px 14px",
              color: "#cbd5e1",
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            Workflow list
          </Link>
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
            Canvas
          </Link>
        </div>
      </header>

      <div
        style={{
          marginTop: 14,
          padding: 14,
          border: "1px solid rgba(34,197,94,0.4)",
          borderRadius: 12,
          background: "rgba(34,197,94,0.06)",
          fontSize: 13,
          color: "#bbf7d0",
        }}
      >
        Every endpoint here is CORS-open (<code>Access-Control-Allow-Origin: *</code>) so any service
        can call it. Pair this page with{" "}
        <Link href="/api/openapi.json" style={{ color: "#86efac" }}>
          /api/openapi.json
        </Link>{" "}
        to generate clients in your language of choice.
      </div>

      <Section title="Quick Start">
        <CodeBlock>{`# Health check
curl ${baseUrl}/api/health

# List the workflows the API can run right now
curl ${baseUrl}/api/workflows

# Run one. Whatever you pass as "input" becomes the
# argument to the first script. The "finalOutput" in
# the response is the value at the End node.
curl -X POST ${baseUrl}/api/workflows/${sample}/run \\
  -H 'Content-Type: application/json' \\
  -d '{"input": {"a": 7, "b": 5}}'`}</CodeBlock>
      </Section>

      <Section title="Endpoints">
        <EndpointBox method="GET" path="/api/health">
          Service ping. Returns the active workspace path and the workflow count. Use this for
          uptime checks and to confirm where the server is reading from.
        </EndpointBox>

        <EndpointBox method="GET" path="/api/workflows">
          List every workflow JSON in the active workspace. Each summary has{" "}
          <code>id</code>, <code>filename</code>, <code>runtimeName</code>, node/edge counts, and{" "}
          <code>modifiedAt</code>. Sorted newest first.
        </EndpointBox>

        <EndpointBox method="GET" path="/api/workflows/{id}">
          Fetch the full graph as JSON. Useful when another service wants to inspect a flow before
          running it.
        </EndpointBox>

        <EndpointBox method="POST" path="/api/workflows">
          Create or overwrite a workflow. Body:{" "}
          <code>{`{ "workflow": <Workflow>, "id"?: <string> }`}</code>. When <code>id</code> is
          omitted, a fresh{" "}
          <code>{"<slug>-<unix-ms>"}</code> is generated.
        </EndpointBox>

        <EndpointBox method="DELETE" path="/api/workflows/{id}">
          Remove the workflow file from disk.
        </EndpointBox>

        <EndpointBox method="POST" path="/api/workflows/{id}/run">
          Execute a workflow against the supplied <code>input</code>. Response shape:
          <CodeBlock>{`{
  "status": "completed" | "stopped" | "error",
  "finalOutput": <any>,        // value at the End node
  "error":       <string>?,    // present when status === "error"
  "workflowId":  <string>,
  "durationMs":  <integer>,
  "steps": [                   // omit by sending {"compact": true}
    {
      "nodeId":     <string>,
      "kind":       <NodeKind>,
      "name":       <string>,
      "input":      <any>,
      "output":     <any>,
      "status":     "ok" | "skipped" | "error",
      "branchInfo": <string>?,
      "error":      <string>?
    },
    ...
  ]
}`}</CodeBlock>
          <div style={{ marginTop: 10 }}>
            HTTP <strong>200</strong> for completed/stopped runs, <strong>500</strong> when the
            workflow itself surfaced an error, <strong>400</strong> for invalid request body or
            component compile errors, <strong>404</strong> when the id doesn&apos;t exist.
          </div>
        </EndpointBox>
      </Section>

      <Section title="Custom components">
        <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.6 }}>
          ComponentTask nodes call out to a registered component. Since functions can&apos;t cross
          the wire as JSON, callers can pass component bodies as strings. Each is compiled with{" "}
          <code>new Function(&quot;input&quot;, body)</code> server-side. Same caveats as ScriptTask
          scripts: run only against trusted inputs in production, ideally behind your own
          authentication layer.
          <CodeBlock>{`curl -X POST ${baseUrl}/api/workflows/${sample}/run \\
  -H 'Content-Type: application/json' \\
  -d '{
    "input": {"a": 5, "b": 9},
    "components": {
      "AdwQuery": "return { ...input, queried: true };"
    }
  }'`}</CodeBlock>
        </div>
      </Section>

      <Section title="Currently runnable workflows">
        {items.length === 0 ? (
          <div
            style={{
              border: "1px dashed rgba(71,85,105,0.95)",
              borderRadius: 10,
              padding: 18,
              color: "#94a3b8",
              fontSize: 13,
              textAlign: "center",
            }}
          >
            No workflows yet — open the canvas, build one, and click Save Workflow. It will appear
            here.
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              style={{
                border: "1px solid rgba(71,85,105,0.95)",
                borderRadius: 12,
                padding: 14,
                marginBottom: 14,
                background: "rgba(15,23,42,0.55)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 10,
                  justifyContent: "space-between",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#ffffff" }}>
                    {item.runtimeName ?? item.id}
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 11,
                      color: "#64748b",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    }}
                  >
                    id <code style={{ color: "#cbd5e1" }}>{item.id}</code> · {item.nodeCount} nodes
                    · {item.edgeCount} edges
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Link
                    href={`/?workflow=${encodeURIComponent(item.id)}`}
                    style={{
                      borderRadius: 6,
                      border: "1px solid rgba(100,116,139,0.95)",
                      padding: "5px 10px",
                      color: "#cbd5e1",
                      fontSize: 11,
                      textDecoration: "none",
                    }}
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/api/workflows/${encodeURIComponent(item.id)}`}
                    style={{
                      borderRadius: 6,
                      border: "1px solid rgba(100,116,139,0.95)",
                      padding: "5px 10px",
                      color: "#cbd5e1",
                      fontSize: 11,
                      textDecoration: "none",
                    }}
                  >
                    Raw JSON
                  </Link>
                </div>
              </div>
              <TryRunPanel
                workflowId={item.id}
                defaultInput={
                  item.id.startsWith("simple-add") ? '{ "a": 7, "b": 5 }' : "{}"
                }
              />
            </div>
          ))
        )}
      </Section>
    </main>
  );
}
