import { NextResponse } from "next/server";
import { isSafeWorkflowId, readWorkflow } from "@/lib/workflow-store";
import { runWorkflow } from "@/lib/workflow-runtime";
import { corsPreflight, withCors } from "@/lib/cors";

interface RunRequestBody {
  input?: unknown;
  maxSteps?: number;
  // Components can't cross the wire as functions, so callers pass an
  // optional map of `componentName -> string-form JS body`. Each script is
  // wrapped with new Function("input", body); the return value is the
  // component output. Same `new Function` caveats as ScriptTask scripts —
  // run only against trusted inputs in production.
  components?: Record<string, string>;
  // When true, the response only includes finalOutput + status + error,
  // skipping the per-step trace. Default false.
  compact?: boolean;
}

interface RunResponse {
  status: "completed" | "stopped" | "error";
  finalOutput?: unknown;
  error?: string;
  steps?: ReturnType<typeof runWorkflow>["steps"];
  workflowId: string;
  durationMs: number;
}

export async function OPTIONS() {
  return corsPreflight();
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const id = params.id;
  if (!isSafeWorkflowId(id)) {
    return withCors(
      NextResponse.json({ error: "invalid workflow id" }, { status: 400 }),
    );
  }

  const workflow = await readWorkflow(id);
  if (!workflow) {
    return withCors(
      NextResponse.json({ error: "workflow not found" }, { status: 404 }),
    );
  }

  let body: RunRequestBody = {};
  try {
    const text = await request.text();
    body = text ? (JSON.parse(text) as RunRequestBody) : {};
  } catch (error) {
    return withCors(
      NextResponse.json(
        {
          error: `invalid JSON body: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
        { status: 400 },
      ),
    );
  }

  // Compile any caller-supplied component scripts up front so we report
  // syntax errors as 400 rather than as runtime errors mid-execution.
  let components: Record<string, (input: unknown) => unknown> = {};
  if (body.components && typeof body.components === "object") {
    try {
      for (const [name, source] of Object.entries(body.components)) {
        if (typeof source !== "string") continue;
        // eslint-disable-next-line no-new-func
        components[name] = new Function("input", source) as (
          input: unknown,
        ) => unknown;
      }
    } catch (error) {
      return withCors(
        NextResponse.json(
          {
            error: `component script failed to compile: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
          { status: 400 },
        ),
      );
    }
  }

  const start = Date.now();
  const result = runWorkflow(workflow, body.input ?? {}, {
    components,
    maxSteps:
      typeof body.maxSteps === "number" && body.maxSteps > 0
        ? Math.min(body.maxSteps, 5_000)
        : undefined,
  });
  const durationMs = Date.now() - start;

  const responseBody: RunResponse = {
    status: result.status,
    finalOutput: result.finalOutput,
    error: result.error,
    workflowId: id,
    durationMs,
    ...(body.compact ? {} : { steps: result.steps }),
  };

  const httpStatus =
    result.status === "completed"
      ? 200
      : result.status === "stopped"
        ? 200
        : 500;

  return withCors(NextResponse.json(responseBody, { status: httpStatus }));
}
