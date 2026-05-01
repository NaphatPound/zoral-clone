"use client";

import { useState } from "react";
import { runWorkflow, type ExecutionResult, type StepStatus } from "@/lib/workflow-runtime";
import type { Workflow } from "@/lib/types";

interface RunPanelProps {
  workflow: Workflow;
  onClose: () => void;
  onResult: (result: ExecutionResult | null) => void;
}

const STATUS_COLORS: Record<StepStatus, { dot: string; text: string; bg: string }> = {
  ok: { dot: "#22c55e", text: "#bbf7d0", bg: "rgba(34,197,94,0.12)" },
  skipped: { dot: "#facc15", text: "#fde68a", bg: "rgba(250,204,21,0.10)" },
  error: { dot: "#f87171", text: "#fecaca", bg: "rgba(248,113,113,0.12)" },
};

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function RunPanel({ workflow, onClose, onResult }: RunPanelProps) {
  const [inputText, setInputText] = useState("{}");
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    setParseError(null);
    let parsed: unknown = {};
    if (inputText.trim()) {
      try {
        parsed = JSON.parse(inputText);
      } catch (error) {
        setParseError(
          error instanceof Error
            ? `Input JSON is invalid: ${error.message}`
            : "Input JSON is invalid",
        );
        setRunning(false);
        return;
      }
    }
    try {
      const next = await runWorkflow(workflow, parsed);
      setResult(next);
      onResult(next);
    } catch (error) {
      setParseError(
        error instanceof Error
          ? `Run failed: ${error.message}`
          : "Run failed",
      );
    } finally {
      setRunning(false);
    }
  };

  const handleClear = () => {
    setResult(null);
    onResult(null);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-slate-950/75 px-4 py-10 backdrop-blur-sm"
      style={{ position: "fixed", inset: 0, zIndex: 40 }}
    >
      <div
        className="flex h-[calc(100vh-5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl"
        style={{
          background: "#020617",
          color: "#e2e8f0",
          border: "1px solid rgba(51,65,85,0.95)",
          borderRadius: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid rgba(51,65,85,0.95)",
            padding: "16px 24px",
          }}
        >
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.18em", color: "#38bdf8", textTransform: "uppercase" }}>
              Run Workflow
            </div>
            <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: "#ffffff" }}>
              {workflow.meta.runtimeName ?? "Untitled"}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#94a3b8" }}>
              Executes scripts via <code>new Function</code> with branch picking from condition expressions. Components fall back to a pass-through stub when no implementation is registered.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleRun}
              disabled={running}
              style={{
                borderRadius: 8,
                border: "1px solid #34d399",
                background: "#059669",
                padding: "8px 14px",
                color: "#ffffff",
                fontSize: 13,
                fontWeight: 600,
                cursor: running ? "not-allowed" : "pointer",
                opacity: running ? 0.6 : 1,
              }}
            >
              {running ? "Running..." : "Run"}
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={!result}
              style={{
                borderRadius: 8,
                border: "1px solid rgba(100,116,139,0.95)",
                padding: "8px 14px",
                color: "#cbd5e1",
                fontSize: 13,
                background: "transparent",
                cursor: result ? "pointer" : "not-allowed",
                opacity: result ? 1 : 0.5,
              }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                borderRadius: 8,
                border: "1px solid rgba(100,116,139,0.95)",
                padding: "8px 14px",
                color: "#cbd5e1",
                fontSize: 13,
                background: "transparent",
              }}
            >
              Close
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) 2fr", flex: 1, minHeight: 0 }}>
          <div style={{ padding: 24, borderRight: "1px solid rgba(51,65,85,0.95)", overflow: "auto" }}>
            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 8 }}>
              Initial Input (JSON)
            </div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              spellCheck={false}
              style={{
                width: "100%",
                minHeight: 240,
                background: "#0f172a",
                color: "#e2e8f0",
                border: `1px solid ${parseError ? "#f87171" : "rgba(71,85,105,0.95)"}`,
                borderRadius: 8,
                padding: 12,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 12,
                lineHeight: 1.45,
                outline: "none",
                resize: "vertical",
              }}
            />
            {parseError ? (
              <div style={{ marginTop: 8, fontSize: 12, color: "#fca5a5" }}>{parseError}</div>
            ) : (
              <div style={{ marginTop: 8, fontSize: 11, color: "#64748b" }}>
                Becomes the <code>input</code> argument passed to the first script.
              </div>
            )}

            {result ? (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 6 }}>
                  Result
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color:
                      result.status === "completed"
                        ? "#86efac"
                        : result.status === "stopped"
                          ? "#fde68a"
                          : "#fca5a5",
                  }}
                >
                  Status: {result.status}
                  {result.error ? ` — ${result.error}` : ""}
                </div>
                <pre
                  style={{
                    marginTop: 8,
                    background: "#0f172a",
                    border: "1px solid rgba(71,85,105,0.95)",
                    borderRadius: 8,
                    padding: 12,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: "#e2e8f0",
                    whiteSpace: "pre-wrap",
                    maxHeight: 280,
                    overflow: "auto",
                  }}
                >
                  {safeJson(result.finalOutput)}
                </pre>
              </div>
            ) : null}
          </div>

          <div style={{ padding: 24, overflow: "auto" }}>
            <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 12 }}>
              Execution Trace
            </div>
            {!result ? (
              <div style={{ color: "#64748b", fontSize: 13 }}>
                Click <strong style={{ color: "#cbd5e1" }}>Run</strong> to execute the workflow against the input on the left.
              </div>
            ) : result.steps.length === 0 ? (
              <div style={{ color: "#64748b", fontSize: 13 }}>No steps were executed.</div>
            ) : (
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {result.steps.map((step, index) => {
                  const palette = STATUS_COLORS[step.status];
                  return (
                    <li
                      key={`${step.nodeId}-${index}`}
                      style={{
                        border: `1px solid ${palette.dot}33`,
                        borderRadius: 10,
                        background: palette.bg,
                        padding: 12,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            display: "inline-block",
                            width: 9,
                            height: 9,
                            borderRadius: 999,
                            background: palette.dot,
                          }}
                        />
                        <span style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                          {index + 1}. {step.kind}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: palette.text }}>{step.name}</span>
                        <span style={{ marginLeft: "auto", fontSize: 11, color: "#64748b" }}>id {step.nodeId}</span>
                      </div>
                      {step.branchInfo ? (
                        <div style={{ marginTop: 6, fontSize: 11, color: "#cbd5e1" }}>↳ {step.branchInfo}</div>
                      ) : null}
                      {step.error ? (
                        <div style={{ marginTop: 6, fontSize: 12, color: "#fca5a5" }}>error: {step.error}</div>
                      ) : null}
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ fontSize: 11, color: "#94a3b8", cursor: "pointer" }}>input / output</summary>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
                          <pre
                            style={{
                              background: "#0f172a",
                              border: "1px solid rgba(71,85,105,0.95)",
                              borderRadius: 6,
                              padding: 8,
                              fontSize: 11,
                              lineHeight: 1.4,
                              color: "#e2e8f0",
                              whiteSpace: "pre-wrap",
                              maxHeight: 160,
                              overflow: "auto",
                              margin: 0,
                            }}
                          >
                            {safeJson(step.input)}
                          </pre>
                          <pre
                            style={{
                              background: "#0f172a",
                              border: "1px solid rgba(71,85,105,0.95)",
                              borderRadius: 6,
                              padding: 8,
                              fontSize: 11,
                              lineHeight: 1.4,
                              color: "#e2e8f0",
                              whiteSpace: "pre-wrap",
                              maxHeight: 160,
                              overflow: "auto",
                              margin: 0,
                            }}
                          >
                            {safeJson(step.output)}
                          </pre>
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
