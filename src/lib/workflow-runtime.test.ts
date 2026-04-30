import { describe, expect, it } from "vitest";
import { runWorkflow } from "./workflow-runtime";
import type { Workflow, WorkflowNode, WorkflowEdge } from "./types";

function node(
  id: string,
  partial: Partial<WorkflowNode> & Pick<WorkflowNode, "kind">,
): WorkflowNode {
  return {
    id,
    kind: partial.kind,
    tag: partial.tag ?? partial.kind,
    name: partial.name ?? id,
    description: partial.description,
    nextId: partial.nextId,
    componentName: partial.componentName,
    script: partial.script,
    processOutputScript: partial.processOutputScript,
    boundaryEvents: partial.boundaryEvents ?? [],
    position: partial.position,
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
  it("walks a linear flow Start → ScriptTask → End", () => {
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

    const result = runWorkflow(wf, { value: 4 });
    expect(result.status).toBe("completed");
    expect(result.finalOutput).toEqual({ value: 4, doubled: 8 });
    expect(result.steps.map((s) => s.nodeId)).toEqual(["s", "t", "e"]);
  });

  it("branches at a gateway by evaluating condition expressions", () => {
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

    const a = runWorkflow(wf, { kind: "a" });
    expect(a.status).toBe("completed");
    expect((a.finalOutput as { branch: string }).branch).toBe("a");
    expect(a.steps.some((s) => s.nodeId === "a-task")).toBe(true);
    expect(a.steps.some((s) => s.nodeId === "b-task")).toBe(false);

    const b = runWorkflow(wf, { kind: "b" });
    expect(b.status).toBe("completed");
    expect((b.finalOutput as { branch: string }).branch).toBe("b");
  });

  it("calls registered components and applies process-output script", () => {
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

    const result = runWorkflow(
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

  it("reports a script error and stops execution", () => {
    const wf = workflow(
      [
        node("s", { kind: "start" }),
        node("t", { kind: "scriptTask", script: "throw new Error('boom');" }),
        node("e", { kind: "end" }),
      ],
      [edge("s", "t"), edge("t", "e")],
    );

    const result = runWorkflow(wf, {});
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/boom/);
    expect(result.steps.find((s) => s.nodeId === "t")?.status).toBe("error");
    expect(result.steps.some((s) => s.nodeId === "e")).toBe(false);
  });

  it("stops cleanly when an isolated condition node is reached and its expression is false", () => {
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

    const result = runWorkflow(wf, {});
    expect(result.status).toBe("stopped");
    expect(result.steps.find((s) => s.nodeId === "c")?.status).toBe("skipped");
    expect(result.steps.some((s) => s.nodeId === "e")).toBe(false);
  });

  it("returns an error when there is no start node", () => {
    const wf = workflow([node("e", { kind: "end" })], []);
    const result = runWorkflow(wf, {});
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/start/i);
  });
});
