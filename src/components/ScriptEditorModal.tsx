"use client";
import { useEffect, useRef, useState } from "react";

export type ScriptMode = "js" | "blocks";

interface ScriptEditorModalProps {
  open: boolean;
  title: string;
  initialScript: string;
  initialMode: ScriptMode;
  initialBlocksJson?: string;
  onCancel: () => void;
  onSave: (result: {
    script: string;
    scriptMode: ScriptMode;
    scriptBlocksJson?: string;
  }) => void;
}

export default function ScriptEditorModal({
  open,
  title,
  initialScript,
  initialMode,
  initialBlocksJson,
  onCancel,
  onSave,
}: ScriptEditorModalProps) {
  const [mode, setMode] = useState<ScriptMode>(initialMode);
  const [scriptText, setScriptText] = useState(initialScript);
  const [blocksJson, setBlocksJson] = useState<string | undefined>(
    initialBlocksJson,
  );
  const [generatedFromBlocks, setGeneratedFromBlocks] =
    useState<string>(initialScript);
  const [dirty, setDirty] = useState(false);
  const [blocklyError, setBlocklyError] = useState<string | null>(null);

  const blocklyContainerRef = useRef<HTMLDivElement | null>(null);
  const blocklyWorkspaceRef = useRef<unknown>(null);
  const blocklyApiRef = useRef<{
    Blockly: typeof import("blockly");
    setup: typeof import("@/lib/blockly-setup");
  } | null>(null);

  // Reset state when (re)opened
  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setScriptText(initialScript);
    setBlocksJson(initialBlocksJson);
    setGeneratedFromBlocks(initialScript);
    setDirty(false);
    setBlocklyError(null);
  }, [open, initialMode, initialScript, initialBlocksJson]);

  // Esc to cancel
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        attemptCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dirty]);

  // Lazy-init Blockly when entering blocks mode
  useEffect(() => {
    if (!open) return;
    if (mode !== "blocks") return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      try {
        const [Blockly, setup] = await Promise.all([
          import("blockly"),
          import("@/lib/blockly-setup"),
        ]);
        if (cancelled || !blocklyContainerRef.current) return;
        blocklyApiRef.current = { Blockly, setup };
        setup.ensureCustomBlocksRegistered();

        // Dispose any existing workspace before re-injecting
        const previous = blocklyWorkspaceRef.current as
          | { dispose?: () => void }
          | null;
        if (previous && typeof previous.dispose === "function") {
          previous.dispose();
          blocklyWorkspaceRef.current = null;
        }

        const ws = Blockly.inject(blocklyContainerRef.current, {
          toolbox: setup.WORKFLOW_TOOLBOX,
          theme: Blockly.Themes.Classic,
          renderer: "zelos",
          trashcan: true,
          zoom: { controls: true, wheel: true, startScale: 0.95 },
          grid: { spacing: 20, length: 3, colour: "#1f2937", snap: true },
        });
        blocklyWorkspaceRef.current = ws;
        setup.loadWorkspace(ws, blocksJson);

        // Resize when container changes
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => {
            Blockly.svgResize(ws);
          });
          resizeObserver.observe(blocklyContainerRef.current);
        }
        // Initial resize after layout settles
        requestAnimationFrame(() => Blockly.svgResize(ws));

        const onChange = () => {
          try {
            const code = setup.generateScriptFromWorkspace(ws);
            setGeneratedFromBlocks(code);
            const json = setup.serializeWorkspace(ws);
            setBlocksJson(json);
            setDirty(true);
          } catch (err) {
            setBlocklyError(
              err instanceof Error ? err.message : String(err),
            );
          }
        };
        ws.addChangeListener(onChange);
      } catch (err) {
        setBlocklyError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
      if (resizeObserver) resizeObserver.disconnect();
      const ws = blocklyWorkspaceRef.current as
        | { dispose?: () => void }
        | null;
      if (ws && typeof ws.dispose === "function") {
        ws.dispose();
        blocklyWorkspaceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  function attemptCancel() {
    if (dirty) {
      const ok = window.confirm("Discard your changes?");
      if (!ok) return;
    }
    onCancel();
  }

  function attemptModeSwitch(next: ScriptMode) {
    if (next === mode) return;
    if (next === "blocks" && mode === "js") {
      const hasJs = scriptText.trim().length > 0;
      if (hasJs && !blocksJson) {
        const ok = window.confirm(
          "Switching to blocks mode will start from an empty workspace. Your JavaScript text is kept and will be replaced when you save in blocks mode. Continue?",
        );
        if (!ok) return;
      }
    }
    if (next === "js" && mode === "blocks") {
      const ok = window.confirm(
        "Switch to JavaScript mode? You can edit the generated code freely, but switching back to blocks mode keeps your existing block tree (not the edits).",
      );
      if (!ok) return;
      // Sync generated code into the text editor
      setScriptText(generatedFromBlocks);
    }
    setMode(next);
  }

  function handleSave() {
    if (mode === "js") {
      onSave({
        script: scriptText,
        scriptMode: "js",
        scriptBlocksJson: undefined,
      });
    } else {
      onSave({
        script: generatedFromBlocks,
        scriptMode: "blocks",
        scriptBlocksJson: blocksJson,
      });
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(2, 6, 23, 0.78)",
        backdropFilter: "blur(6px)",
        display: "flex",
        flexDirection: "column",
        padding: 24,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) attemptCancel();
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "#0b1020",
          border: "1px solid rgba(71, 85, 105, 0.95)",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "12px 16px",
            borderBottom: "1px solid rgba(51, 65, 85, 0.95)",
            background: "rgba(15, 23, 42, 0.7)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>
              Script Editor
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>{title}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              role="tablist"
              aria-label="Editor mode"
              style={{
                display: "inline-flex",
                background: "rgba(15, 23, 42, 0.95)",
                border: "1px solid rgba(71, 85, 105, 0.95)",
                borderRadius: 8,
                padding: 2,
              }}
            >
              <button
                role="tab"
                aria-selected={mode === "js"}
                onClick={() => attemptModeSwitch("js")}
                style={tabButtonStyle(mode === "js")}
              >
                JavaScript
              </button>
              <button
                role="tab"
                aria-selected={mode === "blocks"}
                onClick={() => attemptModeSwitch("blocks")}
                style={tabButtonStyle(mode === "blocks")}
              >
                Blocks
              </button>
            </div>
            <button
              onClick={attemptCancel}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid rgba(71, 85, 105, 0.95)",
                background: "transparent",
                color: "#e2e8f0",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "1px solid rgba(16, 185, 129, 0.85)",
                background: "rgba(16, 185, 129, 0.95)",
                color: "#0b1020",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Save
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, position: "relative", display: "flex" }}>
          {mode === "js" ? (
            <textarea
              autoFocus
              value={scriptText}
              onChange={(e) => {
                setScriptText(e.target.value);
                setDirty(true);
              }}
              spellCheck={false}
              style={{
                flex: 1,
                background: "#020617",
                color: "#a7f3d0",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 13,
                lineHeight: 1.55,
                padding: "16px 20px",
                border: "none",
                outline: "none",
                resize: "none",
              }}
            />
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div
                ref={blocklyContainerRef}
                style={{
                  flex: 1,
                  minHeight: 0,
                  background: "#0f172a",
                }}
              />
              {blocklyError ? (
                <div
                  style={{
                    padding: "8px 12px",
                    background: "rgba(239, 68, 68, 0.15)",
                    color: "#fecaca",
                    fontSize: 12,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    borderTop: "1px solid rgba(239, 68, 68, 0.4)",
                  }}
                >
                  {blocklyError}
                </div>
              ) : null}
              <details
                style={{
                  borderTop: "1px solid rgba(51, 65, 85, 0.95)",
                  background: "#020617",
                  color: "#94a3b8",
                  padding: "8px 12px",
                  fontSize: 12,
                  maxHeight: 180,
                  overflow: "auto",
                }}
              >
                <summary style={{ cursor: "pointer", color: "#cbd5e1" }}>
                  Generated JavaScript (preview)
                </summary>
                <pre
                  style={{
                    margin: "6px 0 0 0",
                    color: "#a7f3d0",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: 12,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {generatedFromBlocks || "// (empty — drag blocks to begin)"}
                </pre>
              </details>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid rgba(51, 65, 85, 0.95)",
            background: "rgba(15, 23, 42, 0.7)",
            color: "#64748b",
            fontSize: 11,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>
            Esc to cancel · Save returns to the workflow with the script
            applied to this node.
          </span>
          <span>{dirty ? "Unsaved changes" : "Up to date"}</span>
        </div>
      </div>
    </div>
  );
}

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 6,
    border: "none",
    background: active ? "rgba(56, 189, 248, 0.2)" : "transparent",
    color: active ? "#e0f2fe" : "#94a3b8",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };
}
