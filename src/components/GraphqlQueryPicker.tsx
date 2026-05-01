"use client";

import { useEffect, useState } from "react";

export interface SavedQuerySummary {
  id: string;
  name: string;
  description?: string;
  query: string;
  operationName?: string;
  variables?: Record<string, unknown>;
  tags?: string[];
  updatedAt: string;
}

interface PickerProps {
  endpoint: string;
  apiKey?: string;
  onClose: () => void;
  onPick: (item: SavedQuerySummary) => void;
}

function deriveListUrl(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    url.pathname = "/api/saved-queries";
    url.search = "";
    return url.toString();
  } catch {
    return "/api/saved-queries";
  }
}

export default function GraphqlQueryPicker({
  endpoint,
  apiKey,
  onClose,
  onPick,
}: PickerProps) {
  const [items, setItems] = useState<SavedQuerySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let aborted = false;
    const headers: Record<string, string> = { accept: "application/json" };
    if (apiKey && apiKey.trim()) headers["x-api-key"] = apiKey.trim();

    setLoading(true);
    fetch(deriveListUrl(endpoint), { headers, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load saved queries (status ${response.status})`);
        }
        const payload = (await response.json()) as { items?: SavedQuerySummary[] };
        if (aborted) return;
        setItems(payload.items ?? []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load saved queries");
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });

    return () => {
      aborted = true;
    };
  }, [endpoint, apiKey]);

  const filtered = filter.trim()
    ? items.filter((item) => {
        const needle = filter.trim().toLowerCase();
        return (
          item.name.toLowerCase().includes(needle) ||
          (item.description ?? "").toLowerCase().includes(needle) ||
          (item.tags ?? []).some((tag) => tag.toLowerCase().includes(needle))
        );
      })
    : items;

  const selected = items.find((item) => item.id === selectedId) ?? null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(2,6,23,0.78)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          width: "min(720px, 92vw)",
          maxHeight: "82vh",
          background: "#0b1220",
          color: "#e2e8f0",
          border: "1px solid rgba(51,65,85,0.95)",
          borderRadius: 16,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid rgba(51,65,85,0.95)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              ADW Saved Queries
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              {deriveListUrl(endpoint)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid rgba(71,85,105,0.95)",
              color: "#cbd5e1",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <div style={{ padding: "10px 18px" }}>
          <input
            type="text"
            value={filter}
            placeholder="ค้นหาตามชื่อ / tag / คำอธิบาย"
            onChange={(event) => setFilter(event.target.value)}
            style={{
              width: "100%",
              border: "1px solid rgba(71,85,105,0.95)",
              background: "#020617",
              color: "#e2e8f0",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 13,
              outline: "none",
            }}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 0,
            flex: 1,
            minHeight: 0,
          }}
        >
          <div
            style={{
              borderRight: "1px solid rgba(51,65,85,0.95)",
              overflowY: "auto",
              padding: "4px 12px 12px",
            }}
          >
            {loading ? (
              <div style={{ padding: 24, color: "#94a3b8", fontSize: 13 }}>
                Loading...
              </div>
            ) : error ? (
              <div style={{ padding: 16, color: "#fca5a5", fontSize: 13 }}>
                {error}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 24, color: "#94a3b8", fontSize: 13 }}>
                ไม่พบ saved query ตรงกับเงื่อนไข
              </div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {filtered.map((item) => {
                  const isActive = selectedId === item.id;
                  return (
                    <li key={item.id} style={{ marginBottom: 6 }}>
                      <label
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "flex-start",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: `1px solid ${
                            isActive ? "#2dd4bf" : "rgba(51,65,85,0.95)"
                          }`,
                          background: isActive
                            ? "rgba(45,212,191,0.10)"
                            : "rgba(15,23,42,0.6)",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="radio"
                          name="adw-saved-query"
                          checked={isActive}
                          onChange={() => setSelectedId(item.id)}
                          style={{ marginTop: 4 }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>
                            {item.name}
                          </div>
                          {item.description ? (
                            <div
                              style={{
                                fontSize: 12,
                                color: "#94a3b8",
                                marginTop: 2,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                              }}
                            >
                              {item.description}
                            </div>
                          ) : null}
                          {item.tags && item.tags.length > 0 ? (
                            <div
                              style={{
                                marginTop: 4,
                                display: "flex",
                                gap: 4,
                                flexWrap: "wrap",
                              }}
                            >
                              {item.tags.map((tag) => (
                                <span
                                  key={tag}
                                  style={{
                                    fontSize: 10,
                                    border: "1px solid rgba(71,85,105,0.95)",
                                    borderRadius: 6,
                                    padding: "1px 6px",
                                    color: "#cbd5e1",
                                  }}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div
            style={{
              padding: 12,
              overflowY: "auto",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 12,
              minWidth: 0,
            }}
          >
            {selected ? (
              <>
                <div
                  style={{
                    fontFamily:
                      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    fontSize: 12,
                    color: "#94a3b8",
                    marginBottom: 6,
                  }}
                >
                  Preview · {selected.name}
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: 10,
                    background: "#020617",
                    border: "1px solid rgba(51,65,85,0.95)",
                    borderRadius: 8,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {selected.query}
                </pre>
                {selected.variables ? (
                  <>
                    <div
                      style={{
                        fontFamily:
                          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        fontSize: 12,
                        color: "#94a3b8",
                        margin: "10px 0 6px",
                      }}
                    >
                      variables
                    </div>
                    <pre
                      style={{
                        margin: 0,
                        padding: 10,
                        background: "#020617",
                        border: "1px solid rgba(51,65,85,0.95)",
                        borderRadius: 8,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {JSON.stringify(selected.variables, null, 2)}
                    </pre>
                  </>
                ) : null}
              </>
            ) : (
              <div
                style={{
                  color: "#94a3b8",
                  fontFamily:
                    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  fontSize: 13,
                }}
              >
                ติ๊กเลือก saved query ทางซ้ายเพื่อดู preview
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid rgba(51,65,85,0.95)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid rgba(71,85,105,0.95)",
              color: "#cbd5e1",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (selected) {
                onPick(selected);
                onClose();
              }
            }}
            style={{
              background: selected ? "#0d9488" : "rgba(15,118,110,0.4)",
              border: "1px solid #2dd4bf",
              color: "#ffffff",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              cursor: selected ? "pointer" : "not-allowed",
            }}
          >
            Use this query
          </button>
        </div>
      </div>
    </div>
  );
}
