import { describe, expect, it } from "vitest";
import { runWorkflow } from "./workflow-runtime";
import type { Workflow, WorkflowNode, WorkflowEdge } from "./types";

function node(
  id: string,
  partial: Partial<WorkflowNode> & Pick<WorkflowNode, "kind">,
): WorkflowNode {
  return {
    ...partial,
    id,
    kind: partial.kind,
    tag: partial.tag ?? partial.kind,
    name: partial.name ?? id,
    boundaryEvents: partial.boundaryEvents ?? [],
    attributes: partial.attributes ?? {},
  };
}

function edge(source: string, target: string): WorkflowEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    kind: "sequence",
  };
}

function workflow(nodes: WorkflowNode[], edges: WorkflowEdge[]): Workflow {
  return {
    meta: { runtimeName: "Test" },
    globals: [],
    nodes,
    edges,
  };
}

describe("runWorkflow", () => {
  it("walks a linear flow Start → ScriptTask → End", async () => {
    const wf = workflow(
      [
        node("s", { kind: "start" }),
        node("t", {
          kind: "scriptTask",
          script: "return { ...input, doubled: input.value * 2 };",
        }),
        node("e", { kind: "end" }),
      ],
      [edge("s", "t"), edge("t", "e")],
    );

    const result = await runWorkflow(wf, { value: 4 });
    expect(result.status).toBe("completed");
    expect(result.finalOutput).toEqual({ value: 4, doubled: 8 });
    expect(result.steps.map((s) => s.nodeId)).toEqual(["s", "t", "e"]);
  });

  it("branches at a gateway by evaluating condition expressions", async () => {
    const wf = workflow(
      [
        node("s", { kind: "start" }),
        node("g", { kind: "gateway" }),
        node("c-if", {
          kind: "condition",
          name: "If",
          description: "return input.kind === 'a';",
        }),
        node("c-else", {
          kind: "condition",
          name: "Else",
          description: "return true;",
        }),
        node("a-task", {
          kind: "scriptTask",
          script: "return { ...input, branch: 'a' };",
        }),
        node("b-task", {
          kind: "scriptTask",
          script: "return { ...input, branch: 'b' };",
        }),
        node("e", { kind: "end" }),
      ],
      [
        edge("s", "g"),
        edge("g", "c-if"),
        edge("g", "c-else"),
        edge("c-if", "a-task"),
        edge("c-else", "b-task"),
        edge("a-task", "e"),
        edge("b-task", "e"),
      ],
    );

    const a = await runWorkflow(wf, { kind: "a" });
    expect(a.status).toBe("completed");
    expect((a.finalOutput as { branch: string }).branch).toBe("a");
    expect(a.steps.some((s) => s.nodeId === "a-task")).toBe(true);
    expect(a.steps.some((s) => s.nodeId === "b-task")).toBe(false);

    const b = await runWorkflow(wf, { kind: "b" });
    expect(b.status).toBe("completed");
    expect((b.finalOutput as { branch: string }).branch).toBe("b");
  });

  it("calls registered components and applies process-output script", async () => {
    const wf = workflow(
      [
        node("s", { kind: "start" }),
        node("c", {
          kind: "componentTask",
          componentName: "double",
          script: "return input.value;",
          processOutputScript: "return { result: output };",
        }),
        node("e", { kind: "end" }),
      ],
      [edge("s", "c"), edge("c", "e")],
    );

    const result = await runWorkflow(
      wf,
      { value: 7 },
      {
        components: {
          double: (input) => (input as number) * 2,
        },
      },
    );
    expect(result.status).toBe("completed");
    expect(result.finalOutput).toEqual({ result: 14 });
  });

  it("reports a script error and stops execution", async () => {
    const wf = workflow(
      [
        node("s", { kind: "start" }),
        node("t", { kind: "scriptTask", script: "throw new Error('boom');" }),
        node("e", { kind: "end" }),
      ],
      [edge("s", "t"), edge("t", "e")],
    );

    const result = await runWorkflow(wf, {});
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/boom/);
    expect(result.steps.find((s) => s.nodeId === "t")?.status).toBe("error");
    expect(result.steps.some((s) => s.nodeId === "e")).toBe(false);
  });

  it("stops cleanly when an isolated condition node is reached and its expression is false", async () => {
    const wf = workflow(
      [
        node("s", { kind: "start" }),
        node("c", {
          kind: "condition",
          description: "return false;",
        }),
        node("e", { kind: "end" }),
      ],
      [edge("s", "c"), edge("c", "e")],
    );

    const result = await runWorkflow(wf, {});
    expect(result.status).toBe("stopped");
    expect(result.steps.find((s) => s.nodeId === "c")?.status).toBe("skipped");
    expect(result.steps.some((s) => s.nodeId === "e")).toBe(false);
  });

  it("returns an error when there is no start node", async () => {
    const wf = workflow([node("e", { kind: "end" })], []);
    const result = await runWorkflow(wf, {});
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/start/i);
  });

  it("executes a graphqlQuery node against the configured endpoint", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fakeFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: typeof input === "string" ? input : input.toString(),
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      });
      return new Response(
        JSON.stringify({ data: { books: [{ id: "1", title: "Kafka" }] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const wf = workflow(
      [
        node("s", { kind: "start" }),
        node("q", {
          kind: "graphqlQuery",
          tag: "GraphqlQueryTask",
          graphqlEndpoint: "http://example/api/external/graphql",
          graphqlQuery: "query Books($limit: Int!) { books(limit: $limit) { id title } }",
          graphqlVariables: '{ "limit": 1 }',
          graphqlOperationName: "Books",
        }),
        node("e", { kind: "end" }),
      ],
      [edge("s", "q"), edge("q", "e")],
    );

    const result = await runWorkflow(wf, {}, { fetchImpl: fakeFetch });
    expect(result.status).toBe("completed");
    expect(result.finalOutput).toEqual({ books: [{ id: "1", title: "Kafka" }] });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://example/api/external/graphql");
    const body = calls[0].body as Record<string, unknown>;
    expect(body.query).toContain("books(limit: $limit)");
    expect(body.variables).toEqual({ limit: 1 });
    expect(body.operationName).toBe("Books");
  });

  it("evaluates graphqlQuery variables as a JS expression with `input`", async () => {
    let capturedVariables: unknown;
    const fakeFetch: typeof fetch = (async (_url, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      capturedVariables = (body as Record<string, unknown>).variables;
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
      });
    }) as typeof fetch;

    const wf = workflow(
      [
        node("s", { kind: "start" }),
        node("q", {
          kind: "graphqlQuery",
          graphqlEndpoint: "http://example/graphql",
          graphqlQuery: "query($id: ID!) { thing(id: $id) { id } }",
          graphqlVariables: "return { id: input.targetId };",
        }),
        node("e", { kind: "end" }),
      ],
      [edge("s", "q"), edge("q", "e")],
    );

    const result = await runWorkflow(
      wf,
      { targetId: "abc" },
      { fetchImpl: fakeFetch },
    );
    expect(result.status).toBe("completed");
    expect(capturedVariables).toEqual({ id: "abc" });
  });

  it("propagates GraphQL `errors` payload as an execution error", async () => {
    const fakeFetch: typeof fetch = (async () =>
      new Response(
        JSON.stringify({
          errors: [{ message: "Cannot query field `foo` on type `Book`." }],
        }),
        { status: 200 },
      )) as typeof fetch;

    const wf = workflow(
      [
        node("s", { kind: "start" }),
        node("q", {
          kind: "graphqlQuery",
          graphqlEndpoint: "http://example/graphql",
          graphqlQuery: "{ foo }",
        }),
        node("e", { kind: "end" }),
      ],
      [edge("s", "q"), edge("q", "e")],
    );

    const result = await runWorkflow(wf, {}, { fetchImpl: fakeFetch });
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/Cannot query field/);
  });
});
