import { NextResponse } from "next/server";
import {
  listWorkflowSummaries,
  saveWorkflow,
} from "@/lib/workflow-store";
import type { Workflow } from "@/lib/types";

export async function GET() {
  try {
    const items = await listWorkflowSummaries();
    return NextResponse.json({ items });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown read failure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workflow?: Workflow;
      id?: string;
    };
    if (!body.workflow || typeof body.workflow !== "object") {
      return NextResponse.json(
        { error: "workflow is required" },
        { status: 400 },
      );
    }
    const result = await saveWorkflow(body.workflow, { id: body.id });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown write failure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
