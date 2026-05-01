import { NextResponse } from "next/server";
import { listWorkflowSummaries } from "@/lib/workflow-store";
import { corsPreflight, resolveBaseUrl, withCors } from "@/lib/cors";

export async function OPTIONS() {
  return corsPreflight();
}

export async function GET(request: Request) {
  const baseUrl = resolveBaseUrl(request);
  const summaries = await listWorkflowSummaries();
  const ids = summaries.map((s) => s.id);

  const spec = {
    openapi: "3.0.3",
    info: {
      title: "Zoral Clone Workflow API",
      version: "1.2.0",
      description:
        "Run, list, fetch, save, and delete low-code workflow graphs by id. Workflows are JSON files stored in the active workspace folder; calling /run executes the graph using the same interpreter the canvas uses (script tasks, condition expressions, gateway branching, graphqlQuery nodes that POST to the ADW Query service, end-of-flow return value).",
    },
    servers: [{ url: baseUrl }],
    components: {
      schemas: {
        Workflow: {
          type: "object",
          required: ["meta", "globals", "nodes", "edges"],
          properties: {
            meta: {
              type: "object",
              properties: {
                runtimeName: { type: "string" },
                description: { type: "string" },
                formatVersion: { type: "string" },
                revision: { type: "string" },
              },
            },
            globals: { type: "array", items: { type: "object" } },
            nodes: { type: "array", items: { $ref: "#/components/schemas/Node" } },
            edges: { type: "array", items: { $ref: "#/components/schemas/Edge" } },
          },
        },
        WorkflowSample: {
          type: "object",
          required: ["name", "input"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            input: { description: "Sample input passed to /run." },
            output: { description: "Sample of expected finalOutput." },
          },
        },
        CatalogEndpoint: {
          type: "object",
          required: ["id", "name", "method", "path", "runUrl"],
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            method: { type: "string", enum: ["POST"] },
            path: { type: "string" },
            runUrl: { type: "string" },
            rawWorkflowUrl: { type: "string" },
            openApiRef: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            nodeCount: { type: "integer" },
            edgeCount: { type: "integer" },
            modifiedAt: { type: "string", format: "date-time" },
            inputSchema: { description: "JSON Schema or free-form descriptor." },
            outputSchema: { description: "JSON Schema or free-form descriptor." },
            samples: {
              type: "array",
              items: {
                allOf: [
                  { $ref: "#/components/schemas/WorkflowSample" },
                  {
                    type: "object",
                    properties: { exampleCurl: { type: "string" } },
                  },
                ],
              },
            },
            graphqlNodes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  nodeId: { type: "string" },
                  name: { type: "string" },
                  endpoint: { type: "string" },
                  operationName: { type: "string" },
                  savedQueryId: { type: "string" },
                },
              },
            },
          },
        },
        Catalog: {
          type: "object",
          required: ["service", "endpoints", "generatedAt"],
          properties: {
            service: {
              type: "object",
              properties: {
                name: { type: "string" },
                baseUrl: { type: "string" },
                version: { type: "string" },
                description: { type: "string" },
                docs: {
                  type: "object",
                  properties: {
                    openapi: { type: "string" },
                    integration: { type: "string" },
                  },
                },
              },
            },
            generatedAt: { type: "string", format: "date-time" },
            endpoints: {
              type: "array",
              items: { $ref: "#/components/schemas/CatalogEndpoint" },
            },
          },
        },
        Node: {
          type: "object",
          required: ["id", "kind", "tag", "name", "boundaryEvents", "attributes"],
          properties: {
            id: { type: "string" },
            kind: {
              type: "string",
              enum: [
                "start",
                "end",
                "componentTask",
                "scriptTask",
                "gateway",
                "condition",
                "graphqlQuery",
                "unknown",
              ],
            },
            tag: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            componentName: { type: "string" },
            script: { type: "string" },
            processOutputScript: { type: "string" },
            nextId: { type: "string" },
            boundaryEvents: { type: "array", items: { type: "object" } },
            attributes: {
              type: "object",
              additionalProperties: { type: "string" },
            },
            position: {
              type: "object",
              properties: { x: { type: "number" }, y: { type: "number" } },
            },
            graphqlEndpoint: {
              type: "string",
              description:
                "graphqlQuery only — full URL of the ADW Query GraphQL endpoint, typically http://localhost:3001/api/external/graphql.",
            },
            graphqlQuery: {
              type: "string",
              description:
                "graphqlQuery only — GraphQL document body sent to the endpoint.",
            },
            graphqlVariables: {
              type: "string",
              description:
                "graphqlQuery only — either JSON object or a JS expression (with access to `input`) that evaluates to the variables object.",
            },
            graphqlOperationName: {
              type: "string",
              description:
                "graphqlQuery only — optional GraphQL operationName.",
            },
            graphqlApiKey: {
              type: "string",
              description:
                "graphqlQuery only — optional ADW Query API key, sent as `x-api-key` header.",
            },
            graphqlSavedQueryId: {
              type: "string",
              description:
                "graphqlQuery only — id of the saved query in the ADW Query service this node was populated from. Informational; the runtime sends `graphqlQuery` directly without re-resolving the id.",
            },
          },
        },
        Edge: {
          type: "object",
          required: ["id", "source", "target", "kind"],
          properties: {
            id: { type: "string" },
            source: { type: "string" },
            target: { type: "string" },
            kind: { type: "string", enum: ["sequence", "boundary"] },
            label: { type: "string" },
            condition: { type: "string" },
          },
        },
        WorkflowSummary: {
          type: "object",
          properties: {
            id: { type: "string" },
            filename: { type: "string" },
            runtimeName: { type: "string" },
            nodeCount: { type: "integer" },
            edgeCount: { type: "integer" },
            modifiedAt: { type: "string", format: "date-time" },
          },
        },
        ExecutionStep: {
          type: "object",
          properties: {
            nodeId: { type: "string" },
            kind: { type: "string" },
            name: { type: "string" },
            input: {},
            output: {},
            status: { type: "string", enum: ["ok", "skipped", "error"] },
            error: { type: "string" },
            branchInfo: { type: "string" },
          },
        },
        RunRequest: {
          type: "object",
          properties: {
            input: {
              description: "Initial value passed as `input` to the first node.",
            },
            maxSteps: {
              type: "integer",
              description: "Optional execution-step ceiling (defaults to 500, hard max 5000).",
            },
            components: {
              type: "object",
              additionalProperties: { type: "string" },
              description:
                "Map of componentName -> JS function body. Each is compiled with `new Function(\"input\", body)` server-side. Run only against trusted inputs.",
            },
            compact: {
              type: "boolean",
              description: "When true, omit the per-step trace from the response.",
            },
          },
        },
        RunResponse: {
          type: "object",
          required: ["status", "workflowId", "durationMs"],
          properties: {
            status: { type: "string", enum: ["completed", "stopped", "error"] },
            finalOutput: {
              description: "The value returned by the End node (or the last script before stop).",
            },
            error: { type: "string" },
            workflowId: { type: "string" },
            durationMs: { type: "integer" },
            steps: {
              type: "array",
              items: { $ref: "#/components/schemas/ExecutionStep" },
            },
          },
        },
      },
    },
    paths: {
      "/api/catalog": {
        get: {
          summary:
            "Self-describing API catalog. One call returns every workflow exposed by this service, with method, path, samples, and OpenAPI cross-reference. Designed for frontends or AI agents that want to discover and pick endpoints dynamically — analogous to /api/saved-queries on the ADW Query service.",
          tags: ["meta"],
          responses: {
            "200": {
              description: "Catalog snapshot",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Catalog" },
                },
              },
            },
          },
        },
      },
      "/api/health": {
        get: {
          summary: "Service ping",
          tags: ["meta"],
          responses: {
            "200": {
              description: "Service info",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      workspace: { type: "string" },
                      workflowCount: { type: "integer" },
                      time: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/workflows": {
        get: {
          summary: "List workflows in the active workspace",
          tags: ["workflows"],
          responses: {
            "200": {
              description: "Workflow summaries",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      items: {
                        type: "array",
                        items: { $ref: "#/components/schemas/WorkflowSummary" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: "Save / overwrite a workflow",
          tags: ["workflows"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["workflow"],
                  properties: {
                    workflow: { $ref: "#/components/schemas/Workflow" },
                    id: {
                      type: "string",
                      description:
                        "Optional id (matches /^[A-Za-z0-9._-]+$/). When omitted, a new id is generated as <slug>-<unix-ms>.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Saved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      id: { type: "string" },
                      filePath: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/workflows/{id}": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", enum: ids.length ? ids : undefined },
            example: ids[0] ?? "simple-add-demo",
            description: "Workflow id (filename without .json).",
          },
        ],
        get: {
          summary: "Fetch a workflow by id",
          tags: ["workflows"],
          responses: {
            "200": {
              description: "Workflow JSON",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      workflow: { $ref: "#/components/schemas/Workflow" },
                    },
                  },
                },
              },
            },
            "404": { description: "Not found" },
          },
        },
        delete: {
          summary: "Delete a workflow by id",
          tags: ["workflows"],
          responses: {
            "200": { description: "Deleted" },
            "404": { description: "Not found" },
          },
        },
      },
      "/api/workflows/{id}/run": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", enum: ids.length ? ids : undefined },
            example: ids[0] ?? "simple-add-demo",
            description: "Workflow id to execute.",
          },
        ],
        post: {
          summary: "Execute a workflow",
          description:
            "Runs the named workflow against the provided initial `input`. Returns the final output (the value at the End node), the execution status, and a per-step trace.",
          tags: ["workflows"],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RunRequest" },
                examples: {
                  simpleAdd: {
                    summary: "Simple Add Demo — non-negative branch",
                    value: { input: { a: 7, b: 5 } },
                  },
                  simpleAddNegative: {
                    summary: "Simple Add Demo — negative branch",
                    value: { input: { a: -3, b: -4 } },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Workflow finished (or stopped) cleanly",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/RunResponse" },
                },
              },
            },
            "400": { description: "Bad request (invalid id, JSON, or component compile error)" },
            "404": { description: "Workflow not found" },
            "500": { description: "Workflow ended with status=error" },
          },
        },
      },
    },
  };

  return withCors(NextResponse.json(spec));
}
