import type { NodeKind, Workflow, WorkflowNode } from "./types";

export type StepStatus = "ok" | "skipped" | "error";

export interface ExecutionStep {
  nodeId: string;
  kind: NodeKind;
  name: string;
  input: unknown;
  output: unknown;
  status: StepStatus;
  error?: string;
  branchInfo?: string;
}

export type RunStatus = "completed" | "stopped" | "error";

export interface ExecutionResult {
  steps: ExecutionStep[];
  finalOutput: unknown;
  status: RunStatus;
  error?: string;
}

export interface RuntimeOptions {
  components?: Record<string, (input: unknown) => unknown>;
  maxSteps?: number;
  fetchImpl?: typeof fetch;
  graphqlDefaultEndpoint?: string;
}

function evalScript(
  scriptBody: string | undefined,
  value: unknown,
  paramName = "input",
): unknown {
  if (!scriptBody || !scriptBody.trim()) return value;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(paramName, scriptBody);
    return fn(value);
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : String(error),
    );
  }
}

function buildOutgoing(workflow: Workflow): Map<string, string[]> {
  const outgoing = new Map<string, string[]>();
  for (const edge of workflow.edges) {
    if (edge.kind === "boundary") continue;
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source)!.push(edge.target);
  }
  return outgoing;
}

async function executeGraphqlQuery(
  node: WorkflowNode,
  input: unknown,
  options: RuntimeOptions,
): Promise<unknown> {
  const endpoint =
    node.graphqlEndpoint?.trim() || options.graphqlDefaultEndpoint?.trim();
  if (!endpoint) {
    throw new Error(
      "graphqlQuery node has no endpoint (set node.graphqlEndpoint or pass graphqlDefaultEndpoint)",
    );
  }
  const queryText = node.graphqlQuery?.trim();
  if (!queryText) {
    throw new Error("graphqlQuery node has no query body");
  }

  let variables: Record<string, unknown> | undefined;
  if (node.graphqlVariables && node.graphqlVariables.trim()) {
    variables = evalVariables(node.graphqlVariables, input);
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (node.graphqlApiKey && node.graphqlApiKey.trim()) {
    headers["x-api-key"] = node.graphqlApiKey.trim();
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: queryText,
      variables,
      operationName: node.graphqlOperationName?.trim() || undefined,
    }),
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `graphqlQuery endpoint returned non-JSON (status ${response.status}): ${text.slice(0, 200)}`,
    );
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && payload !== null && "message" in payload
        ? String((payload as Record<string, unknown>).message)
        : `HTTP ${response.status}`;
    throw new Error(`graphqlQuery transport error: ${message}`);
  }

  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as Record<string, unknown>).errors) &&
    ((payload as Record<string, unknown>).errors as unknown[]).length > 0
  ) {
    const errors = (payload as Record<string, unknown>).errors as Array<{
      message?: string;
    }>;
    throw new Error(
      `graphqlQuery errors: ${errors.map((entry) => entry.message ?? "unknown").join("; ")}`,
    );
  }

  return (payload as Record<string, unknown>)?.data ?? payload;
}

function evalVariables(source: string, input: unknown): Record<string, unknown> {
  const trimmed = source.trim();
  // Plain JSON path first — no closure over `input`.
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // Fall through to script-style evaluation.
    }
  }
  // eslint-disable-next-line no-new-func
  const fn = new Function("input", trimmed);
  const value = fn(input);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(
    "graphqlQuery variables must evaluate to a plain object (got " +
      typeof value +
      ")",
  );
}

export async function runWorkflow(
  workflow: Workflow,
  initialInput: unknown,
  options: RuntimeOptions = {},
): Promise<ExecutionResult> {
  const components = options.components ?? {};
  const maxSteps = options.maxSteps ?? 500;
  const nodesById = new Map(workflow.nodes.map((n) => [n.id, n]));
  const outgoing = buildOutgoing(workflow);

  const start = workflow.nodes.find((n) => n.kind === "start");
  if (!start) {
    return {
      steps: [],
      finalOutput: undefined,
      status: "error",
      error: "No start node found in this workflow.",
    };
  }

  const steps: ExecutionStep[] = [];
  let current: string | null = start.id;
  let value: unknown = initialInput;
  let executed = 0;

  while (current && executed < maxSteps) {
    executed += 1;
    const node = nodesById.get(current);
    if (!node) {
      return {
        steps,
        finalOutput: value,
        status: "error",
        error: `Unknown node id during execution: ${current}`,
      };
    }
    const before = value;
    const targets = outgoing.get(node.id) ?? [];
    let nextId: string | null = null;
    let after: unknown = before;
    let branchInfo: string | undefined;

    try {
      switch (node.kind) {
        case "start":
          nextId = targets[0] ?? null;
          break;
        case "end":
          steps.push({
            nodeId: node.id,
            kind: node.kind,
            name: node.name || node.id,
            input: before,
            output: before,
            status: "ok",
          });
          return { steps, finalOutput: value, status: "completed" };
        case "scriptTask":
          after = evalScript(node.script, before);
          value = after;
          nextId = targets[0] ?? null;
          break;
        case "componentTask": {
          const componentInput = node.script
            ? evalScript(node.script, before)
            : before;
          const fn: ((value: unknown) => unknown) | undefined =
            components[node.componentName ?? ""];
          const componentOutput =
            typeof fn === "function" ? fn(componentInput) : componentInput;
          after = node.processOutputScript
            ? evalScript(node.processOutputScript, componentOutput, "output")
            : componentOutput;
          value = after;
          branchInfo =
            typeof fn === "function"
              ? `via component "${node.componentName}"`
              : node.componentName
                ? `stub (no impl for "${node.componentName}")`
                : "no component bound";
          nextId = targets[0] ?? null;
          break;
        }
        case "graphqlQuery": {
          const result = await executeGraphqlQuery(node, before, options);
          after = node.processOutputScript
            ? evalScript(node.processOutputScript, result, "output")
            : result;
          value = after;
          branchInfo = node.graphqlSavedQueryId
            ? `saved query ${node.graphqlSavedQueryId}`
            : `${node.graphqlEndpoint ?? options.graphqlDefaultEndpoint ?? "(no endpoint)"}`;
          nextId = targets[0] ?? null;
          break;
        }
        case "gateway": {
          let chosen: string | null = null;
          let chosenLabel = "no branch";
          for (const tid of targets) {
            const tn = nodesById.get(tid);
            if (tn?.kind !== "condition") continue;
            try {
              if (evalScript(tn.description, before)) {
                chosen = tid;
                chosenLabel = `branch → ${tn.name || tid}`;
                break;
              }
            } catch {
              // ignore: try the next condition
            }
          }
          if (!chosen) {
            // Fallback: last target (typically the "else" branch).
            const fallback = targets[targets.length - 1];
            chosen = fallback ?? null;
            if (chosen) {
              chosenLabel = `default → ${
                nodesById.get(chosen)?.name ?? chosen
              }`;
            }
          }
          branchInfo = chosenLabel;
          nextId = chosen;
          break;
        }
        case "condition": {
          const passed = Boolean(evalScript(node.description, before));
          after = passed;
          if (!passed) {
            steps.push({
              nodeId: node.id,
              kind: node.kind,
              name: node.name || node.id,
              input: before,
              output: passed,
              status: "skipped",
              branchInfo: "condition false",
            });
            return { steps, finalOutput: value, status: "stopped" };
          }
          branchInfo = "condition true";
          nextId = targets[0] ?? null;
          break;
        }
        default:
          nextId = targets[0] ?? null;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      steps.push({
        nodeId: node.id,
        kind: node.kind,
        name: node.name || node.id,
        input: before,
        output: undefined,
        status: "error",
        error: message,
        branchInfo,
      });
      return {
        steps,
        finalOutput: value,
        status: "error",
        error: `${node.kind} "${node.name || node.id}" failed: ${message}`,
      };
    }

    steps.push({
      nodeId: node.id,
      kind: node.kind,
      name: node.name || node.id,
      input: before,
      output: after,
      status: "ok",
      branchInfo,
    });

    current = nextId;
  }

  if (executed >= maxSteps) {
    return {
      steps,
      finalOutput: value,
      status: "error",
      error: `Aborted after ${maxSteps} steps (possible infinite loop).`,
    };
  }

  return { steps, finalOutput: value, status: "completed" };
}

export function statusByNodeId(
  result: ExecutionResult,
): Map<string, StepStatus> {
  const map = new Map<string, StepStatus>();
  for (const step of result.steps) {
    // Last status wins if a node ran multiple times in a loop.
    map.set(step.nodeId, step.status);
  }
  return map;
}
