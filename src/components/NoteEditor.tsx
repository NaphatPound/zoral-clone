"use client";
import { useCallback, useState } from "react";
import type { NoteAttachment, WorkflowNode } from "@/lib/types";

interface NoteEditorProps {
  node: WorkflowNode;
  onChange: (
    patch: Partial<Pick<WorkflowNode, "noteText" | "noteAttachments">>,
  ) => void;
  onAskClaude: (node: WorkflowNode) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function classifyClient(file: File): NoteAttachment["kind"] {
  const m = file.type;
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "file";
}

export default function NoteEditor({
  node,
  onChange,
  onAskClaude,
}: NoteEditorProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const attachments = node.noteAttachments ?? [];

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      setUploading(true);
      setError(null);
      try {
        const next: NoteAttachment[] = [...attachments];
        for (const file of arr) {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch(
            `/api/notes/${encodeURIComponent(node.id)}/attachments`,
            { method: "POST", body: form },
          );
          const json = (await res.json()) as
            | { ok: true; attachment: NoteAttachment }
            | { error: string };
          if (!res.ok || "error" in json) {
            throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
          }
          // Replace any prior attachment with the same filename
          const filtered = next.filter(
            (a) => a.filename !== json.attachment.filename,
          );
          filtered.push({
            ...json.attachment,
            kind: json.attachment.kind ?? classifyClient(file),
          });
          next.length = 0;
          next.push(...filtered);
        }
        onChange({ noteAttachments: next });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setUploading(false);
      }
    },
    [attachments, node.id, onChange],
  );

  const handleDelete = useCallback(
    async (filename: string) => {
      const ok = window.confirm(`Delete attachment "${filename}"?`);
      if (!ok) return;
      try {
        await fetch(
          `/api/notes/${encodeURIComponent(node.id)}/attachments/${encodeURIComponent(
            filename,
          )}`,
          { method: "DELETE" },
        );
        onChange({
          noteAttachments: attachments.filter((a) => a.filename !== filename),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [attachments, node.id, onChange],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "block" }}>
        <span
          style={{
            display: "block",
            marginBottom: 4,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#94a3b8",
          }}
        >
          Note text (markdown)
        </span>
        <textarea
          value={node.noteText ?? ""}
          onChange={(e) => onChange({ noteText: e.target.value })}
          rows={8}
          placeholder="Describe what you want this part of the workflow to do. Drop images/videos/audio below to give Claude examples."
          style={{
            width: "100%",
            background: "#020617",
            color: "#fde68a",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 12,
            padding: "10px 12px",
            border: "1px solid rgba(71, 85, 105, 0.95)",
            borderRadius: 8,
            outline: "none",
            resize: "vertical",
          }}
        />
      </label>

      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#94a3b8",
            }}
          >
            Attachments ({attachments.length})
          </span>
          <button
            type="button"
            onClick={() => onAskClaude(node)}
            disabled={uploading}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid rgba(244, 114, 182, 0.6)",
              background: "rgba(244, 114, 182, 0.15)",
              color: "#fbcfe8",
              fontSize: 11,
              fontWeight: 700,
              cursor: uploading ? "not-allowed" : "pointer",
            }}
          >
            ✨ Ask Claude about this note
          </button>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files);
          }}
          style={{
            border: dragOver
              ? "2px dashed rgba(244, 114, 182, 0.85)"
              : "2px dashed rgba(71, 85, 105, 0.95)",
            borderRadius: 8,
            padding: 14,
            textAlign: "center",
            background: dragOver
              ? "rgba(244, 114, 182, 0.06)"
              : "rgba(15, 23, 42, 0.5)",
            color: "#94a3b8",
            fontSize: 12,
            cursor: "pointer",
            transition: "background 120ms ease, border-color 120ms ease",
          }}
        >
          <label style={{ cursor: "pointer", display: "block" }}>
            {uploading
              ? "Uploading…"
              : "Drop files here or click to upload (image / video / audio / text · max 50 MB each)"}
            <input
              type="file"
              multiple
              onChange={(e) => {
                if (e.target.files) uploadFiles(e.target.files);
                e.target.value = "";
              }}
              style={{ display: "none" }}
            />
          </label>
        </div>

        {error ? (
          <div
            style={{
              marginTop: 8,
              padding: "6px 10px",
              borderRadius: 6,
              background: "rgba(239, 68, 68, 0.15)",
              color: "#fecaca",
              fontSize: 11,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            }}
          >
            {error}
          </div>
        ) : null}

        {attachments.length > 0 ? (
          <ul
            style={{
              listStyle: "none",
              margin: "10px 0 0 0",
              padding: 0,
              display: "grid",
              gap: 8,
            }}
          >
            {attachments.map((att) => (
              <AttachmentRow
                key={att.filename}
                noteId={node.id}
                attachment={att}
                onDelete={() => handleDelete(att.filename)}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function AttachmentRow({
  noteId,
  attachment,
  onDelete,
}: {
  noteId: string;
  attachment: NoteAttachment;
  onDelete: () => void;
}) {
  const url = `/api/notes/${encodeURIComponent(noteId)}/attachments/${encodeURIComponent(attachment.filename)}`;
  return (
    <li
      style={{
        border: "1px solid rgba(71, 85, 105, 0.95)",
        borderRadius: 8,
        padding: 8,
        background: "rgba(15, 23, 42, 0.6)",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: 64,
          minHeight: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#020617",
          borderRadius: 6,
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {attachment.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={attachment.filename}
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        ) : attachment.kind === "video" ? (
          <video
            src={url}
            style={{ width: "100%", display: "block" }}
            controls
          />
        ) : attachment.kind === "audio" ? (
          <span style={{ color: "#94a3b8", fontSize: 22 }}>♪</span>
        ) : (
          <span style={{ color: "#94a3b8", fontSize: 22 }}>📄</span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: "#e2e8f0",
            fontSize: 12,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={attachment.filename}
        >
          {attachment.filename}
        </div>
        <div style={{ color: "#94a3b8", fontSize: 10, marginTop: 2 }}>
          {attachment.kind} · {attachment.mime} · {formatBytes(attachment.size)}
        </div>
        {attachment.kind === "audio" ? (
          <audio
            src={url}
            controls
            style={{ marginTop: 6, width: "100%" }}
          />
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDelete}
        title="Delete attachment"
        style={{
          padding: "4px 8px",
          borderRadius: 6,
          border: "1px solid rgba(239, 68, 68, 0.6)",
          background: "transparent",
          color: "#fca5a5",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </li>
  );
}
