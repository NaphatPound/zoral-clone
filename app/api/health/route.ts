import { NextResponse } from "next/server";
import { readWorkspaceConfig } from "@/lib/workspace";
import { listWorkflowSummaries } from "@/lib/workflow-store";
import { corsPreflight, withCors } from "@/lib/cors";

export async function OPTIONS() {
  return corsPreflight();
}

export async function GET() {
  const [workspace, summaries] = await Promise.all([
    readWorkspaceConfig(),
    listWorkflowSummaries(),
  ]);
  return withCors(
    NextResponse.json({
      ok: true,
      workspace: workspace.active,
      workflowCount: summaries.length,
      time: new Date().toISOString(),
    }),
  );
}
