import { NextResponse } from "next/server";
import { generateWorkflowAssistantDocument } from "@/lib/workflow-assistant";
import type { Workflow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const workflow = (body as { workflow?: unknown })?.workflow;
  if (!isWorkflow(workflow)) {
    return NextResponse.json(
      { error: "`workflow` is required" },
      { status: 400 },
    );
  }

  const model = (body as { model?: unknown })?.model;
  const result = await generateWorkflowAssistantDocument({
    workflow,
    model:
      typeof model === "string" && model.trim()
        ? model.trim()
        : process.env.GEMINI_MODEL,
  });

  return NextResponse.json(result);
}

function isWorkflow(value: unknown): value is Workflow {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.meta !== undefined &&
    Array.isArray(candidate.globals) &&
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.edges)
  );
}
