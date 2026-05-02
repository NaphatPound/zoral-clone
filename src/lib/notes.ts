// File-based storage for note attachments. Each note gets its own folder
// under the active workspace at `notes/<noteId>/`. The folder holds:
//   - the raw uploaded files (any kind)
//   - `note.md` (auto-generated when the workflow is saved) — this is what
//     the embedded Claude terminal reads when the user clicks "Ask Claude".
//
// Note IDs come from the workflow node ID, which the editor controls. We
// validate them against a strict allowlist so a malicious workflow file
// can't pivot to a path traversal.

import fs from "node:fs/promises";
import path from "node:path";
import { getActiveWorkspace } from "./workspace";
import type { NoteAttachment, NoteAttachmentKind, WorkflowNode } from "./types";

const ID_PATTERN = /^[a-zA-Z0-9._-]+$/;
const FILENAME_PATTERN = /^[a-zA-Z0-9._-][a-zA-Z0-9._\- ()]{0,200}$/;

export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50 MB / file

export function isSafeNoteId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export function isSafeAttachmentName(name: string): boolean {
  if (!name) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name === "." || name === "..") return false;
  if (name === "note.md") return false; // reserved
  return FILENAME_PATTERN.test(name);
}

export async function notesRoot(): Promise<string> {
  const workspace = await getActiveWorkspace();
  const dir = path.join(workspace, "notes");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function noteDir(noteId: string): Promise<string> {
  if (!isSafeNoteId(noteId)) {
    throw new Error(`unsafe note id: ${noteId}`);
  }
  const root = await notesRoot();
  const dir = path.join(root, noteId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function classifyAttachment(mime: string): NoteAttachmentKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

export async function saveAttachment(
  noteId: string,
  filename: string,
  mime: string,
  data: Buffer,
): Promise<NoteAttachment> {
  if (!isSafeAttachmentName(filename)) {
    throw new Error(`unsafe filename: ${filename}`);
  }
  if (data.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `attachment too large (${data.length} bytes > ${MAX_ATTACHMENT_BYTES})`,
    );
  }
  const dir = await noteDir(noteId);
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, data);
  return {
    filename,
    kind: classifyAttachment(mime),
    size: data.length,
    mime: mime || "application/octet-stream",
  };
}

export async function readAttachment(
  noteId: string,
  filename: string,
): Promise<Buffer | null> {
  if (!isSafeNoteId(noteId)) return null;
  if (!isSafeAttachmentName(filename)) return null;
  try {
    const dir = await noteDir(noteId);
    return await fs.readFile(path.join(dir, filename));
  } catch {
    return null;
  }
}

export async function deleteAttachment(
  noteId: string,
  filename: string,
): Promise<boolean> {
  if (!isSafeNoteId(noteId)) return false;
  if (!isSafeAttachmentName(filename)) return false;
  try {
    const dir = await noteDir(noteId);
    await fs.unlink(path.join(dir, filename));
    return true;
  } catch {
    return false;
  }
}

export async function listAttachments(
  noteId: string,
): Promise<Array<{ filename: string; size: number }>> {
  if (!isSafeNoteId(noteId)) return [];
  try {
    const dir = await noteDir(noteId);
    const entries = await fs.readdir(dir);
    const items = await Promise.all(
      entries
        .filter((name) => isSafeAttachmentName(name))
        .map(async (filename) => {
          const stat = await fs.stat(path.join(dir, filename));
          return { filename, size: stat.size };
        }),
    );
    return items;
  } catch {
    return [];
  }
}

// Build the note.md content that Claude Code will consume.
export function renderNoteMarkdown(node: WorkflowNode): string {
  const lines: string[] = [];
  lines.push(`# ${node.name || node.id}`);
  lines.push("");
  if (node.description?.trim()) {
    lines.push(`> ${node.description.trim()}`);
    lines.push("");
  }
  if (node.noteText?.trim()) {
    lines.push(node.noteText.trim());
    lines.push("");
  }
  const attachments = node.noteAttachments ?? [];
  if (attachments.length > 0) {
    lines.push("## Attachments");
    lines.push("");
    for (const att of attachments) {
      const sizeKb = Math.max(1, Math.round(att.size / 1024));
      if (att.kind === "image") {
        lines.push(`![${att.filename}](./${att.filename})`);
      } else {
        lines.push(
          `- \`${att.filename}\` — ${att.kind}, ${att.mime}, ${sizeKb} KB`,
        );
      }
    }
    lines.push("");
  }
  lines.push(`<!-- node id: ${node.id} -->`);
  lines.push("");
  return lines.join("\n");
}

// Sync every note node in the workflow to disk by rewriting its note.md.
// Removes notes/<id>/ folders for note IDs no longer present in the workflow.
export async function syncNotesToDisk(
  noteNodes: WorkflowNode[],
): Promise<void> {
  const root = await notesRoot();
  const presentIds = new Set<string>();
  for (const node of noteNodes) {
    if (!isSafeNoteId(node.id)) continue;
    presentIds.add(node.id);
    const dir = await noteDir(node.id);
    await fs.writeFile(
      path.join(dir, "note.md"),
      renderNoteMarkdown(node),
      "utf8",
    );
  }
  // Sweep orphan note folders only when the call carries the full set
  // (callers that only update one note should not trigger this — but for
  // now every save passes the whole workflow, so this is correct).
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!ID_PATTERN.test(entry)) continue;
    if (presentIds.has(entry)) continue;
    try {
      await fs.rm(path.join(root, entry), { recursive: true, force: true });
    } catch {
      // Non-fatal — orphan dir stays around.
    }
  }
}
