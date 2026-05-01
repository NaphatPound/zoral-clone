# Zoral Clone — API Integration Guide

This document is for an external frontend (or an AI agent embedded in
another web app) that wants to **discover, preview, and call** the APIs
exposed by this project. It mirrors the way this project consumes the ADW
Query service (saved queries listed at `/api/saved-queries`, queried via
`/api/external/graphql`).

## Mental Model

> Every workflow saved in this project is a **callable JSON API**.
>
> The contract is the same for all of them:
>
> - **`POST /api/workflows/{id}/run`**
> - request body: `{ "input": <any JSON>, "compact"?: boolean }`
> - response body: `{ "status": "completed" | "stopped" | "error", "finalOutput": <any JSON>, ... }`
>
> What changes between workflows is the meaning of `input` and the shape
> of `finalOutput`. Each workflow can carry **input/output schemas and
> example payloads** in its metadata so a remote consumer can render a
> picker UI without hardcoding anything.

## Discovery Flow

A consumer should do this once at startup:

1. `GET /api/catalog` → receive a self-describing snapshot.
2. Render `endpoints[]` as a list. Each entry has `name`, `description`,
   `tags`, `inputSchema`, `outputSchema`, `samples[]`, and a ready-to-use
   `runUrl`.
3. When the user picks one, copy a sample `input` (or build one from
   `inputSchema`) into a request editor.
4. Call `runUrl` with the chosen body.
5. Optionally re-fetch `/api/catalog` if the service's `version` changes.

This is intentionally identical to the ADW Query saved-queries flow used
inside this project's own canvas.

## Base URL

Default local URL: `http://localhost:3002`

All endpoints support browser-origin requests. CORS allows any origin via
`lib/cors.ts` (`Access-Control-Allow-Origin: *`). No API key is required.

## Endpoints At A Glance

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/catalog` | Self-describing API directory (use this first). |
| `GET` | `/api/openapi.json` | Full OpenAPI 3.0 spec for the service. |
| `GET` | `/docs` | Browser-friendly OpenAPI viewer. |
| `GET` | `/api/health` | Liveness ping with workspace + workflow count. |
| `GET` | `/api/workflows` | Raw list of stored workflows (id + counts + mtime). |
| `GET` | `/api/workflows/{id}` | Full workflow JSON (graph + meta). |
| `POST` | `/api/workflows` | Create or overwrite a workflow. |
| `DELETE` | `/api/workflows/{id}` | Delete a workflow. |
| `POST` | `/api/workflows/{id}/run` | **Run a workflow.** This is the actual "API call". |
| `GET` | `/api/workspace` | Read or change the active workspace folder. |

The two endpoints a remote consumer will use most are
`GET /api/catalog` (discovery) and `POST /api/workflows/{id}/run` (call).

## `/api/catalog` Response Shape

```ts
interface Catalog {
  service: {
    name: string;          // "Zoral Clone Workflow API"
    baseUrl: string;       // echoes the host that served the request
    version: string;       // e.g. "1.2.0"
    description: string;
    docs: {
      openapi: string;     // absolute URL to /api/openapi.json
      integration: string; // absolute URL to /api/catalog
    };
  };
  generatedAt: string;     // ISO timestamp
  endpoints: CatalogEndpoint[];
}

interface CatalogEndpoint {
  id: string;              // workflow id, e.g. "adw-demo-books-list"
  name: string;            // human display name (meta.runtimeName)
  description?: string;    // free-form description
  method: "POST";
  path: string;            // "/api/workflows/<id>/run"
  runUrl: string;          // absolute URL — call this directly
  rawWorkflowUrl: string;  // GET this for the full graph
  openApiRef: string;      // JSON Pointer into /api/openapi.json
  tags?: string[];
  nodeCount: number;
  edgeCount: number;
  modifiedAt: string;
  inputSchema?: unknown;   // typically a JSON Schema object
  outputSchema?: unknown;  // typically a JSON Schema object
  samples?: Array<{
    name: string;
    description?: string;
    input: unknown;        // ready to put in `{ "input": ... }`
    output?: unknown;      // expected finalOutput (when known)
    exampleCurl: string;   // a complete curl command, copy-pasteable
  }>;
  graphqlNodes: Array<{    // useful for explaining what the workflow does
    nodeId: string;
    name: string;
    endpoint?: string;     // ADW Query URL it talks to
    operationName?: string;
    savedQueryId?: string;
  }>;
}
```

### Example response (truncated)

```json
{
  "service": {
    "name": "Zoral Clone Workflow API",
    "baseUrl": "http://localhost:3002",
    "version": "1.2.0",
    "docs": {
      "openapi": "http://localhost:3002/api/openapi.json",
      "integration": "http://localhost:3002/api/catalog"
    }
  },
  "generatedAt": "2026-05-02T10:00:00.000Z",
  "endpoints": [
    {
      "id": "adw-demo-books-list",
      "name": "ADW Demo — Books List",
      "description": "Calls the ADW Query service for the first N books...",
      "method": "POST",
      "path": "/api/workflows/adw-demo-books-list/run",
      "runUrl": "http://localhost:3002/api/workflows/adw-demo-books-list/run",
      "tags": ["adw","bookstore","list","demo"],
      "samples": [
        { "name": "default (limit=5)", "input": {} },
        { "name": "top 3 books", "input": { "limit": 3 } }
      ],
      "graphqlNodes": [
        {
          "nodeId": "fetch-books",
          "name": "Fetch Books",
          "endpoint": "http://localhost:3001/api/external/graphql",
          "operationName": "Books"
        }
      ]
    }
  ]
}
```

## Calling A Workflow

### Request

```http
POST /api/workflows/{id}/run HTTP/1.1
Host: localhost:3002
Content-Type: application/json

{
  "input": <any JSON value>,
  "compact": false,
  "maxSteps": 500
}
```

| Field | Type | Notes |
|-------|------|-------|
| `input` | any | Initial value piped into the first node. Most workflows expect a JSON object. |
| `compact` | boolean | `true` to omit the per-step trace from the response. |
| `maxSteps` | integer | Optional cap (1-5000, default 500). Aborts runaway loops. |
| `components` | object | Map of `componentName -> JS function body`. Compiled with `new Function`. **Server-side eval**: only use against trusted callers. |

### Response

```json
{
  "status": "completed",
  "finalOutput": <any JSON value>,
  "workflowId": "adw-demo-books-list",
  "durationMs": 14,
  "steps": [
    {
      "nodeId": "start",
      "kind": "start",
      "name": "Start",
      "input": {...},
      "output": {...},
      "status": "ok"
    }
  ]
}
```

| Status | HTTP code | Meaning |
|--------|-----------|---------|
| `completed` | 200 | Reached an End node. `finalOutput` is the produced value. |
| `stopped` | 200 | A condition node returned `false` and there was no else path. Treated as a clean halt, not an error. |
| `error` | 500 | A node threw (bad script, GraphQL error, missing endpoint, etc.). `error` field is human-readable. |

When `compact: true`, the `steps` array is omitted to save bandwidth — use
this in production. Keep `steps` enabled while debugging because each
entry carries the value flowing into and out of every node.

## Recommended Consumer Flow

```ts
// 1. discover
const catalog = await fetch("http://localhost:3002/api/catalog")
  .then((r) => r.json());

// 2. let the user pick
const endpoint = catalog.endpoints.find((e) => e.id === "adw-demo-books-list");

// 3. seed the form with the first sample
const sample = endpoint.samples?.[0] ?? { input: {} };

// 4. run
const result = await fetch(endpoint.runUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ input: sample.input, compact: true }),
}).then((r) => r.json());

// 5. render result.finalOutput
```

That is the whole loop. Everything else (showing `description`, validating
against `inputSchema`, filtering by `tags`, copying `exampleCurl`) is a UX
choice on top of these primitives.

## Running Workflows That Don't Need The Database

Not every workflow has to talk to ADW. A workflow built only from
`scriptTask` and `gateway` nodes is a pure function over JSON: input goes
in, output comes out, no external dependencies. Such workflows are useful
for transforming or validating data inside a frontend pipeline.

Workflows that include any `graphqlQuery` node depend on the ADW Query
service being reachable. Read each entry's `graphqlNodes[]` to see which
external endpoints it calls.

## Picker UI Recipe

If the consuming frontend wants to mirror the ADW saved-queries picker
that lives inside this project (see `src/components/GraphqlQueryPicker.tsx`),
the same pattern works here:

1. Sidebar list with one row per `endpoint`. Each row shows `name`, the
   first line of `description`, and `tags`.
2. A search/filter box matching `name`, `description`, and `tags`.
3. A right pane that shows the selected entry's `samples[]` as tabs and
   pre-fills a textarea with `JSON.stringify(sample.input, null, 2)`.
4. A "Run" button posting to `runUrl`.
5. A result viewer for `finalOutput`. Use `outputSchema` to render typed
   output (table, key/value, etc.) when available.

The `exampleCurl` field on each sample is suitable for copy-paste in a
"Show as curl" affordance.

## Errors A Consumer Will See

| Symptom | Cause | Fix |
|---------|-------|-----|
| `404 not found` on `/run` | `id` does not match any saved workflow | Re-call `/api/catalog` to refresh the list. |
| `500` with `graphqlQuery node has no endpoint` | Workflow author forgot to set `graphqlEndpoint` and `ADW_QUERY_DEFAULT_ENDPOINT` is unset on the server | Configure the env or edit the workflow on the canvas. |
| `500` with `graphqlQuery transport error` | ADW Query service is down or unreachable | Make sure `http://localhost:3001` (or the configured URL) is up. |
| `500` with `graphqlQuery errors:` | The GraphQL query itself errored | Inspect `result.error` and the workflow's saved query. |
| `400 invalid JSON body` | The request body is not valid JSON | Send `application/json` with valid JSON. |

All errors return a stable shape: `{ "status": "error", "error": "<message>", ... }`.
A consumer can log `error` directly without parsing.

## Schema-Driven Form Generation

Each endpoint may include `inputSchema` (typically a JSON Schema). A
consumer can feed it into any JSON-Schema form library (e.g.
`@rjsf/core`) to render a typed form automatically. When `inputSchema` is
absent, fall back to a free-form JSON textarea.

`outputSchema` lets a consumer pick the right renderer ahead of time —
table for arrays, key/value for objects, scalar for primitives.

## Versioning

`service.version` follows semver. Backwards-incompatible changes (renamed
fields, removed status values) bump the major. Adding endpoints or
optional fields bumps the minor. Persist the last seen version in the
consumer; when it changes, refresh the catalog before issuing complex
calls.

## Security Notes For Consumers

- This service runs **server-side `new Function`** to compile
  `scriptTask`, `processOutputScript`, and `graphqlVariables`. It is
  intended for trusted environments. Never proxy `components` from
  end-users without sanitization.
- `graphqlApiKey` on a workflow node is sent as `x-api-key` to the
  configured ADW endpoint. Treat workflow JSON as sensitive if those
  fields are populated.
- This README assumes localhost. In production, terminate TLS upstream
  and lock down `/api/workspace` (it can rewrite where workflows are
  read/written).

## Cross-Reference

- **OpenAPI spec:** `GET /api/openapi.json` — machine-readable contract
  for every endpoint described above.
- **Browser docs:** `GET /docs` — rendered OpenAPI viewer.
- **ADW Query docs:** see `../adw-query/document.md` and
  `../adw-query/README.md` for the GraphQL service this project depends
  on.
- **Change log:** `logs.md` records the surface that changes per release.
