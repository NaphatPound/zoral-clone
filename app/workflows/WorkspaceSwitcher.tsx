"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

interface WorkspaceSwitcherProps {
  active: string;
  recent: string[];
}

export default function WorkspaceSwitcher({ active, recent }: WorkspaceSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState(active);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async (next: string) => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: next }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to set workspace");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const dropRecent = async (target: string) => {
    setPending(true);
    setError(null);
    try {
      await fetch("/api/workspace", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: target }),
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!path.trim()) return;
    void apply(path.trim());
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={active}
        style={{
          borderRadius: 8,
          border: "1px solid rgba(71, 85, 105, 0.95)",
          background: "rgba(15, 23, 42, 0.85)",
          padding: "9px 14px",
          color: "#e2e8f0",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          maxWidth: 360,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        📂 {active}
      </button>

      {open ? (
        <div
          onClick={() => !pending && setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(2, 6, 23, 0.7)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: 60,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 640,
              background: "#0f172a",
              border: "1px solid rgba(51,65,85,0.95)",
              borderRadius: 14,
              padding: 22,
              color: "#e2e8f0",
              boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#38bdf8",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              Workspace
            </div>
            <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>
              Choose a folder for your flows
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>
              Pick any absolute folder on this machine. Flow JSON files in that
              folder become your workflow list. The terminal panel and Claude
              Code will also start in this folder.
            </div>

            <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
              <label style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.16em" }}>
                Folder path
              </label>
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                spellCheck={false}
                placeholder="/Users/you/Documents/my-flows"
                style={{
                  marginTop: 6,
                  width: "100%",
                  padding: "10px 12px",
                  background: "#020617",
                  border: `1px solid ${error ? "#fb7185" : "rgba(71,85,105,0.95)"}`,
                  borderRadius: 8,
                  color: "#e2e8f0",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: 13,
                  outline: "none",
                }}
              />
              {error ? (
                <div style={{ marginTop: 8, fontSize: 12, color: "#fda4af" }}>{error}</div>
              ) : (
                <div style={{ marginTop: 8, fontSize: 11, color: "#64748b" }}>
                  The folder will be created if it doesn&apos;t exist.
                </div>
              )}
              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  style={{
                    borderRadius: 8,
                    border: "1px solid rgba(100,116,139,0.95)",
                    background: "transparent",
                    padding: "8px 14px",
                    color: "#cbd5e1",
                    fontSize: 13,
                    cursor: pending ? "not-allowed" : "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending || !path.trim()}
                  style={{
                    borderRadius: 8,
                    border: "1px solid #34d399",
                    background: pending ? "#1f2937" : "#059669",
                    padding: "8px 14px",
                    color: "#ffffff",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: pending ? "not-allowed" : "pointer",
                  }}
                >
                  {pending ? "Setting..." : "Open folder"}
                </button>
              </div>
            </form>

            {recent.length > 0 ? (
              <div style={{ marginTop: 22 }}>
                <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 8 }}>
                  Recent
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {recent.map((entry) => (
                    <li
                      key={entry}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        padding: "8px 12px",
                        border: "1px solid rgba(71,85,105,0.6)",
                        background: entry === active ? "rgba(34,197,94,0.08)" : "rgba(15,23,42,0.5)",
                        borderRadius: 8,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => apply(entry)}
                        disabled={pending}
                        title={entry}
                        style={{
                          flex: 1,
                          textAlign: "left",
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          color: entry === active ? "#86efac" : "#e2e8f0",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                          fontSize: 12,
                          cursor: "pointer",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {entry === active ? "✓ " : ""}
                        {entry}
                      </button>
                      <button
                        type="button"
                        onClick={() => dropRecent(entry)}
                        disabled={pending}
                        title="Remove from recent"
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#64748b",
                          cursor: "pointer",
                          fontSize: 12,
                          padding: "0 6px",
                        }}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
