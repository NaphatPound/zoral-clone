"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateWorkflowButton() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const name = window.prompt(
        "Name the new workflow",
        "New Workflow",
      );
      if (name === null) {
        setCreating(false);
        return;
      }
      const trimmed = name.trim() || "New Workflow";
      const response = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow: {
            meta: { runtimeName: trimmed },
            globals: [],
            nodes: [],
            edges: [],
          },
        }),
      });
      const payload = (await response.json()) as {
        id?: string;
        error?: string;
      };
      if (!response.ok || !payload.id) {
        throw new Error(payload.error ?? "Failed to create workflow");
      }
      router.push(`/?workflow=${encodeURIComponent(payload.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workflow");
      setCreating(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {error ? (
        <span style={{ fontSize: 12, color: "#fda4af" }}>{error}</span>
      ) : null}
      <button
        type="button"
        onClick={handleCreate}
        disabled={creating}
        style={{
          borderRadius: 8,
          border: "1px solid #34d399",
          background: "#059669",
          padding: "9px 14px",
          color: "#ffffff",
          fontSize: 13,
          fontWeight: 600,
          cursor: creating ? "not-allowed" : "pointer",
          opacity: creating ? 0.6 : 1,
        }}
      >
        {creating ? "Creating..." : "+ New Workflow"}
      </button>
    </div>
  );
}
