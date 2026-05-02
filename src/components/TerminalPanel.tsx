"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

interface TerminalPanelProps {
  open: boolean;
  width: number;
  onClose: () => void;
  onResize: (next: number) => void;
}

interface ServerMessage {
  type: string;
  terminalId?: string;
  data?: string;
  cwd?: string;
  exitCode?: number;
  error?: string;
}

// Lazy types so TypeScript is happy without importing xterm at module load.
type XTerm = import("@xterm/xterm").Terminal;
type FitAddonInstance = import("@xterm/addon-fit").FitAddon;

const MIN_WIDTH = 280;
const MAX_WIDTH = 900;

function buildWsUrl(): string {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/terminal-ws`;
}

export default function TerminalPanel({
  open,
  width,
  onClose,
  onResize,
}: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddonInstance | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const terminalIdRef = useRef<string | null>(null);

  const [status, setStatus] = useState<"idle" | "starting" | "ready" | "error" | "exited">("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [cwd, setCwd] = useState<string>("");
  const [prompt, setPrompt] = useState<string>("");
  const [autoStartClaude, setAutoStartClaude] = useState<boolean>(true);

  // Drag-to-resize the panel width.
  const dragStartXRef = useRef<number | null>(null);
  const dragStartWidthRef = useRef<number>(width);

  const send = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  }, []);

  const resizePtyToFit = useCallback(() => {
    const fit = fitRef.current;
    const tid = terminalIdRef.current;
    if (!fit || !tid) return;
    try {
      const dims = fit.proposeDimensions();
      fit.fit();
      if (dims) {
        send({ type: "resize", terminalId: tid, cols: dims.cols, rows: dims.rows });
      }
    } catch {
      // ignore measurement failures (panel hidden, etc.)
    }
  }, [send]);

  const teardown = useCallback(() => {
    const ws = wsRef.current;
    const term = termRef.current;
    const tid = terminalIdRef.current;
    if (ws && tid) {
      try {
        ws.send(JSON.stringify({ type: "kill", terminalId: tid }));
      } catch {
        // ignore
      }
    }
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    if (term) term.dispose();
    wsRef.current = null;
    termRef.current = null;
    fitRef.current = null;
    terminalIdRef.current = null;
  }, []);

  // Boot the xterm + ws once when the panel first opens.
  useEffect(() => {
    if (!open || termRef.current) return;
    let cancelled = false;
    setStatus("starting");
    setStatusMessage("Connecting to shell...");

    (async () => {
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-web-links"),
      ]);
      if (cancelled) return;

      const term = new Terminal({
        cursorBlink: true,
        fontFamily: "JetBrains Mono, Menlo, Consolas, monospace",
        fontSize: 12.5,
        allowProposedApi: true,
        theme: {
          background: "#0c0d12",
          foreground: "#e0e2e8",
          cursor: "#7dd3fc",
          selectionBackground: "#3b82f680",
          black: "#1a1b26",
          red: "#f7768e",
          green: "#9ece6a",
          yellow: "#e0af68",
          blue: "#7aa2f7",
          magenta: "#bb9af7",
          cyan: "#7dcfff",
          white: "#a9b1d6",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());
      const node = containerRef.current;
      if (!node) return;
      term.open(node);
      try { fit.fit(); } catch { /* ignore */ }

      termRef.current = term;
      fitRef.current = fit;

      const ws = new WebSocket(buildWsUrl());
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        const dims = (() => {
          try { return fit.proposeDimensions(); } catch { return null; }
        })();
        ws.send(JSON.stringify({
          type: "create",
          cols: dims?.cols ?? 100,
          rows: dims?.rows ?? 30,
        }));
      });

      ws.addEventListener("message", (event) => {
        let msg: ServerMessage;
        try { msg = JSON.parse(event.data) as ServerMessage; } catch { return; }
        if (msg.type === "ready" && msg.terminalId) {
          terminalIdRef.current = msg.terminalId;
          if (msg.cwd) setCwd(msg.cwd);
          setStatus("ready");
          setStatusMessage("");
          if (autoStartClaude) {
            // Optimistically launch the Claude CLI. If it isn't installed the
            // user just sees a "command not found" line — totally fine.
            setTimeout(() => {
              ws.send(JSON.stringify({
                type: "input",
                terminalId: msg.terminalId,
                data: "claude\n",
              }));
            }, 200);
          }
        } else if (msg.type === "output" && msg.data) {
          term.write(msg.data);
        } else if (msg.type === "exit") {
          setStatus("exited");
          setStatusMessage(`Process exited (code ${msg.exitCode ?? "?"}).`);
        } else if (msg.type === "error") {
          setStatus("error");
          setStatusMessage(msg.error ?? "Unknown error");
        }
      });

      ws.addEventListener("close", () => {
        if (!cancelled) {
          setStatus((prev) => (prev === "exited" ? prev : "error"));
          setStatusMessage((prev) => prev || "Disconnected from server.");
        }
      });

      term.onData((data) => {
        const tid = terminalIdRef.current;
        if (tid) ws.send(JSON.stringify({ type: "input", terminalId: tid, data }));
      });
    })();

    return () => {
      cancelled = true;
    };
    // We intentionally only run once per "open" transition. Auto-start preference
    // is read at boot time — flipping it later won't re-spawn the shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Tear down when the panel is closed entirely.
  useEffect(() => {
    if (open) return;
    teardown();
    setStatus("idle");
    setStatusMessage("");
    setCwd("");
  }, [open, teardown]);

  // Resize observer to keep the PTY dims in sync with the visible pane.
  useEffect(() => {
    if (!open) return;
    if (typeof ResizeObserver === "undefined") return;
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => resizePtyToFit());
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, resizePtyToFit]);

  useEffect(() => {
    resizePtyToFit();
  }, [width, resizePtyToFit]);

  // Listen for cross-component requests to inject text (used by the Note
  // editor's "Ask Claude" button). The request is queued client-side and
  // flushed once the PTY is ready, so the user can click the button before
  // the shell has finished spawning.
  useEffect(() => {
    if (!open) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string }>).detail;
      const text = detail?.text;
      if (!text) return;
      const tryFlush = () => {
        const ws = wsRef.current;
        const tid = terminalIdRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN || !tid) return false;
        ws.send(JSON.stringify({ type: "input", terminalId: tid, data: text }));
        return true;
      };
      if (tryFlush()) return;
      // Poll briefly until the PTY is ready (terminal just opened).
      let attempts = 0;
      const id = setInterval(() => {
        attempts += 1;
        if (tryFlush() || attempts >= 40) clearInterval(id);
      }, 250);
    };
    window.addEventListener("zoral:terminal-send", handler);
    return () => window.removeEventListener("zoral:terminal-send", handler);
  }, [open]);

  const handleSendPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const tid = terminalIdRef.current;
    if (!tid) return;
    if (!prompt.trim()) return;
    send({ type: "input", terminalId: tid, data: `${prompt}\n` });
    setPrompt("");
  };

  const handleClear = () => {
    const term = termRef.current;
    if (term) term.clear();
  };

  const handleAbort = () => {
    const tid = terminalIdRef.current;
    if (!tid) return;
    send({ type: "input", terminalId: tid, data: "" });
  };

  const beginResize = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragStartXRef.current = event.clientX;
      dragStartWidthRef.current = width;
      // Use the document so the drag survives leaving the handle box.
      const onMove = (e: MouseEvent) => {
        if (dragStartXRef.current === null) return;
        const delta = e.clientX - dragStartXRef.current;
        const next = Math.min(
          MAX_WIDTH,
          Math.max(MIN_WIDTH, dragStartWidthRef.current + delta),
        );
        onResize(next);
      };
      const onUp = () => {
        dragStartXRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      // While dragging, force the cursor everywhere and disable text selection
      // so dragging over the canvas doesn't flip the cursor or highlight nodes.
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width, onResize],
  );

  if (!open) return null;

  return (
    <aside
      style={{
        position: "fixed",
        top: 88,
        bottom: 0,
        left: 0,
        width,
        zIndex: 25,
        display: "flex",
        flexDirection: "column",
        background: "#0c0d12",
        borderRight: "1px solid rgba(51,65,85,0.95)",
        boxShadow: "0 0 30px rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid rgba(51,65,85,0.95)",
          background: "rgba(15,23,42,0.85)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background:
                status === "ready"
                  ? "#22c55e"
                  : status === "error"
                    ? "#f87171"
                    : status === "exited"
                      ? "#facc15"
                      : "#94a3b8",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: "0.12em" }}>
            Terminal
          </span>
          {cwd ? (
            <span
              title={cwd}
              style={{
                fontSize: 11,
                color: "#94a3b8",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {cwd}
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            onClick={handleClear}
            title="Clear terminal buffer"
            style={btnStyle()}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleAbort}
            title="Send Ctrl+C"
            style={btnStyle()}
          >
            ^C
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Hide panel"
            style={{ ...btnStyle(), color: "#fda4af", borderColor: "rgba(248,113,113,0.4)" }}
          >
            Hide
          </button>
        </div>
      </div>

      {statusMessage ? (
        <div
          style={{
            padding: "6px 12px",
            fontSize: 11,
            color: status === "error" ? "#fca5a5" : "#94a3b8",
            background: "rgba(15,23,42,0.6)",
            borderBottom: "1px solid rgba(51,65,85,0.95)",
          }}
        >
          {statusMessage}
        </div>
      ) : null}

      <div ref={containerRef} style={{ flex: 1, minHeight: 0, padding: "6px 8px" }} />

      <form
        onSubmit={handleSendPrompt}
        style={{
          padding: "10px 12px",
          borderTop: "1px solid rgba(51,65,85,0.95)",
          background: "rgba(15,23,42,0.85)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 10, letterSpacing: "0.16em", color: "#94a3b8", textTransform: "uppercase" }}>
            Send to Claude
          </span>
          <label
            style={{
              fontSize: 10,
              color: "#64748b",
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={autoStartClaude}
              onChange={(e) => setAutoStartClaude(e.target.checked)}
              disabled={status === "ready" || status === "exited"}
            />
            auto-run claude on open
          </label>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder='e.g. "create a workflow that validates loan input then routes to mapConditionCRRandCSR"'
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
            }
          }}
          style={{
            width: "100%",
            background: "#0f172a",
            color: "#e2e8f0",
            border: "1px solid rgba(71,85,105,0.95)",
            borderRadius: 8,
            padding: 8,
            fontSize: 12,
            lineHeight: 1.4,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            resize: "vertical",
            outline: "none",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: "#64748b" }}>⌘/Ctrl + Enter to send</span>
          <button
            type="submit"
            disabled={!prompt.trim() || status !== "ready"}
            style={{
              borderRadius: 8,
              border: "1px solid #34d399",
              background: prompt.trim() && status === "ready" ? "#059669" : "#1f2937",
              padding: "6px 14px",
              color: "#ffffff",
              fontSize: 12,
              fontWeight: 600,
              cursor: prompt.trim() && status === "ready" ? "pointer" : "not-allowed",
              opacity: prompt.trim() && status === "ready" ? 1 : 0.5,
            }}
          >
            Send ↵
          </button>
        </div>
      </form>

      <div
        onMouseDown={beginResize}
        title="Drag to resize"
        style={{
          position: "absolute",
          top: 0,
          right: -5,
          width: 10,
          height: "100%",
          cursor: "col-resize",
          background: "transparent",
          zIndex: 30,
        }}
      >
        {/* Hairline so the user can see where to grab. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 4,
            width: 2,
            height: "100%",
            background: "rgba(56, 189, 248, 0.0)",
            transition: "background 120ms ease",
            pointerEvents: "none",
          }}
          className="terminal-resize-line"
        />
      </div>
    </aside>
  );
}

function btnStyle(): React.CSSProperties {
  return {
    borderRadius: 6,
    border: "1px solid rgba(71,85,105,0.7)",
    background: "transparent",
    padding: "3px 8px",
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}
