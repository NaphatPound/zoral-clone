import type { Workflow, WorkflowSample } from "./types";
import { listWorkflowSummaries, readWorkflow } from "./workflow-store";

export interface CatalogEndpoint {
  id: string;
  name: string;
  description?: string;
  method: "POST";
  path: string;
  runUrl: string;
  rawWorkflowUrl: string;
  openApiRef: string;
  tags?: string[];
  nodeCount: number;
  edgeCount: number;
  modifiedAt: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  samples?: Array<WorkflowSample & { exampleCurl: string }>;
  graphqlNodes: Array<{
    nodeId: string;
    name: string;
    endpoint?: string;
    operationName?: string;
    savedQueryId?: string;
  }>;
}

export interface CatalogService {
  name: string;
  baseUrl: string;
  version: string;
  description: string;
  docs: {
    openapi: string;
    integration: string;
  };
}

export interface Catalog {
  service: CatalogService;
  generatedAt: string;
  endpoints: CatalogEndpoint[];
}

const SERVICE_VERSION = "1.2.0";

function buildExampleCurl(baseUrl: string, id: string, sample: WorkflowSample): string {
  const body = JSON.stringify({ input: sample.input ?? {} });
  // Single-quoted body works for typical JSON; embedded single quotes escaped to be safe.
  const safeBody = body.replace(/'/g, "'\\''");
  return [
    `curl -s -X POST ${baseUrl}/api/workflows/${encodeURIComponent(id)}/run \\`,
    `  -H 'content-type: application/json' \\`,
    `  --data '${safeBody}'`,
  ].join("\n");
}

function summarizeGraphqlNodes(workflow: Workflow): CatalogEndpoint["graphqlNodes"] {
  return workflow.nodes
    .filter((node) => node.kind === "graphqlQuery")
    .map((node) => ({
      nodeId: node.id,
      name: node.name,
      endpoint: node.graphqlEndpoint,
      operationName: node.graphqlOperationName,
      savedQueryId: node.graphqlSavedQueryId,
    }));
}

export async function buildCatalog(baseUrl: string): Promise<Catalog> {
  const summaries = await listWorkflowSummaries();
  const workflows = await Promise.all(
    summaries.map(async (summary) => ({
      summary,
      workflow: await readWorkflow(summary.id),
    })),
  );

  const endpoints: CatalogEndpoint[] = workflows.flatMap(({ summary, workflow }) => {
    if (!workflow) return [];
    const meta = workflow.meta ?? {};
    const samples = Array.isArray(meta.samples)
      ? meta.samples.map((sample) => ({
          ...sample,
          exampleCurl: buildExampleCurl(baseUrl, summary.id, sample),
        }))
      : undefined;

    return [
      {
        id: summary.id,
        name: meta.runtimeName ?? summary.id,
        description: meta.description,
        method: "POST" as const,
        path: `/api/workflows/${summary.id}/run`,
        runUrl: `${baseUrl}/api/workflows/${encodeURIComponent(summary.id)}/run`,
        rawWorkflowUrl: `${baseUrl}/api/workflows/${encodeURIComponent(summary.id)}`,
        openApiRef: `${baseUrl}/api/openapi.json#/paths/~1api~1workflows~1{id}~1run/post`,
        tags: meta.tags,
        nodeCount: summary.nodeCount,
        edgeCount: summary.edgeCount,
        modifiedAt: summary.modifiedAt,
        inputSchema: meta.inputSchema,
        outputSchema: meta.outputSchema,
        samples,
        graphqlNodes: summarizeGraphqlNodes(workflow),
      },
    ];
  });

  return {
    service: {
      name: "Zoral Clone Workflow API",
      baseUrl,
      version: SERVICE_VERSION,
      description:
        "Each saved workflow is a callable API: POST /api/workflows/{id}/run with a JSON `input` and receive the workflow's final output. Some workflows fan out to the ADW Query GraphQL service for live database reads.",
      docs: {
        openapi: `${baseUrl}/api/openapi.json`,
        integration: `${baseUrl}/api/catalog`,
      },
    },
    generatedAt: new Date().toISOString(),
    endpoints,
  };
}
