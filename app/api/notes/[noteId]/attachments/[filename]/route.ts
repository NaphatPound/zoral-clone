import { NextResponse } from "next/server";
import { corsPreflight, withCors } from "@/lib/cors";
import {
  deleteAttachment,
  isSafeAttachmentName,
  isSafeNoteId,
  readAttachment,
} from "@/lib/notes";

export async function OPTIONS() {
  return corsPreflight();
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  pdf: "application/pdf",
};

function guessMime(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  const ext = filename.slice(dot + 1).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export async function GET(
  _request: Request,
  { params }: { params: { noteId: string; filename: string } },
) {
  if (!isSafeNoteId(params.noteId) || !isSafeAttachmentName(params.filename)) {
    return new NextResponse("not found", { status: 404 });
  }
  const data = await readAttachment(params.noteId, params.filename);
  if (!data) {
    return new NextResponse("not found", { status: 404 });
  }
  // Copy into a fresh ArrayBuffer so the body type is unambiguous —
  // Node Buffers can wrap SharedArrayBuffer-backed memory, which the DOM
  // BlobPart signature in @types/node 20 + lib.dom rejects.
  const arrayBuffer = new ArrayBuffer(data.length);
  new Uint8Array(arrayBuffer).set(data);
  return new Response(arrayBuffer, {
    status: 200,
    headers: {
      "content-type": guessMime(params.filename),
      "cache-control": "no-store",
      "content-length": String(data.length),
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { noteId: string; filename: string } },
) {
  if (!isSafeNoteId(params.noteId) || !isSafeAttachmentName(params.filename)) {
    return withCors(
      NextResponse.json({ error: "invalid path" }, { status: 400 }),
    );
  }
  const ok = await deleteAttachment(params.noteId, params.filename);
  return withCors(NextResponse.json({ ok }));
}
