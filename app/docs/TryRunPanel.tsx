"use client";

import { useState } from "react";

interface TryRunPanelProps {
  workflowId: string;
  defaultInput?: string;
}

export default function TryRunPanel({ workflowId, defaultInput }: TryRunPanelProps) {
  const [input, setInput] = useState(defaultInput ?? "{}");
  const [response, setResponse] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  const handleRun = async () => {
    setStatus("running");
    setResponse(null);
    setHttpStatus(null);
    setDurationMs(null);

    let parsed: unknown = {};
    if (input.trim()) {
      try {
        parsed = JSON.parse(input);
      } catch (error) {
        setStatus("error");
        setResponse(
          `Local JSON parse error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return;
      }
    }

    const start = Date.now();
    try {
      const resp = await fetch(
        `/api/workflows/${encodeURIComponent(workflowId)}/run`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: parsed, compact: false }),
        },
      );
      const text = await resp.text();
      setHttpStatus(resp.status);
      setDurationMs(Date.now() - start);
      try {
        setResponse(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setResponse(text);
      }
      setStatus(resp.ok ? "ok" : "error");
    } catch (error) {
      setStatus("error");
      setResponse(
        `Network error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  return (
    <div
      style={{
        border: "1px solid rgba(71,85,105,0.95)",
        borderRadius: 10,
        padding: 14,
        background: "rgba(15,23,42,0.85)",
        marginTop: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "#38bdf8",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          Try it — POST /api/workflows/{workflowId}/run
        </div>
        <div style={{ fontSize: 11, color: "#64748b" }}>
          {durationMs !== null ? `${durationMs} ms` : ""}
          {httpStatus !== null ? ` · HTTP ${httpStatus}` : ""}
        </div>
      </div>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={4}
        spellCheck={false}
        style={{
          marginTop: 8,
          width: "100%",
          background: "#020617",
          color: "#e2e8f0",
          border: "1px solid rgba(71,85,105,0.95)",
          borderRadius: 8,
          padding: 10,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          lineHeight: 1.45,
          outline: "none",
          resize: "vertical",
        }}
      />
      <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          type="button"
          onClick={handleRun}
          disabled={status === "running"}
          style={{
            borderRadius: 8,
            border: "1px solid #fbbf24",
            background: status === "running" ? "#1f2937" : "#d97706",
            padding: "7px 14px",
            color: "#ffffff",
            fontSize: 13,
            fontWeight: 600,
            cursor: status === "running" ? "not-allowed" : "pointer",
          }}
        >
          {status === "running" ? "Running..." : "▶ Run"}
        </button>
      </div>
      {response ? (
        <pre
          style={{
            marginTop: 10,
            background: "#020617",
            color:
              status === "error" ? "#fca5a5" : "#e2e8f0",
            border: `1px solid ${status === "error" ? "#fb7185" : "rgba(71,85,105,0.95)"}`,
            borderRadius: 8,
            padding: 10,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 11,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            maxHeight: 320,
            overflow: "auto",
          }}
        >
          {response}
        </pre>
      ) : null}
    </div>
  );
}
