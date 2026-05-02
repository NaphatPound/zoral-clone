import { NextResponse } from "next/server";
import { corsPreflight, withCors } from "@/lib/cors";
import {
  isSafeNoteId,
  listAttachments,
  saveAttachment,
} from "@/lib/notes";

export async function OPTIONS() {
  return corsPreflight();
}

export async function GET(
  _request: Request,
  { params }: { params: { noteId: string } },
) {
  if (!isSafeNoteId(params.noteId)) {
    return withCors(
      NextResponse.json({ error: "invalid noteId" }, { status: 400 }),
    );
  }
  const items = await listAttachments(params.noteId);
  return withCors(NextResponse.json({ items }));
}

export async function POST(
  request: Request,
  { params }: { params: { noteId: string } },
) {
  if (!isSafeNoteId(params.noteId)) {
    return withCors(
      NextResponse.json({ error: "invalid noteId" }, { status: 400 }),
    );
  }
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "invalid multipart body";
    return withCors(NextResponse.json({ error: message }, { status: 400 }));
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return withCors(
      NextResponse.json(
        { error: "expected a 'file' field with multipart upload" },
        { status: 400 },
      ),
    );
  }
  if (!file.name) {
    return withCors(
      NextResponse.json({ error: "uploaded file has no name" }, { status: 400 }),
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const attachment = await saveAttachment(
      params.noteId,
      file.name,
      file.type || "application/octet-stream",
      buffer,
    );
    return withCors(NextResponse.json({ ok: true, attachment }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "upload failed";
    return withCors(NextResponse.json({ error: message }, { status: 400 }));
  }
}
