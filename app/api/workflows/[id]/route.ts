import { NextResponse } from "next/server";
import {
  deleteWorkflow,
  isSafeWorkflowId,
  readWorkflow,
} from "@/lib/workflow-store";
import { corsPreflight, withCors } from "@/lib/cors";

export async function OPTIONS() {
  return corsPreflight();
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!isSafeWorkflowId(params.id)) {
    return withCors(
      NextResponse.json({ error: "invalid id" }, { status: 400 }),
    );
  }
  const workflow = await readWorkflow(params.id);
  if (!workflow) {
    return withCors(NextResponse.json({ error: "not found" }, { status: 404 }));
  }
  return withCors(NextResponse.json({ id: params.id, workflow }));
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!isSafeWorkflowId(params.id)) {
    return withCors(
      NextResponse.json({ error: "invalid id" }, { status: 400 }),
    );
  }
  const ok = await deleteWorkflow(params.id);
  if (!ok) {
    return withCors(NextResponse.json({ error: "not found" }, { status: 404 }));
  }
  return withCors(NextResponse.json({ ok: true }));
}
