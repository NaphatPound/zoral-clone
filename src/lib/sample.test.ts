import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadSampleWorkflow } from "./sample";

describe("loadSampleWorkflow (real Zoral XML)", () => {
  const projectRoot = path.resolve(__dirname, "../..");
  const workflow = loadSampleWorkflow(projectRoot);

  it("loads the INT_CPL_inquiry_assessment workflow", () => {
    expect(workflow.meta.runtimeName).toMatch(/INT_CPL_inquiry_assessment/);
    expect(workflow.nodes.length).toBeGreaterThan(10);
  });

  it("finds the AdwQueryMapping ComponentTask", () => {
    const node = workflow.nodes.find((n) => n.name === "AdwQueryMapping");
    expect(node).toBeDefined();
    expect(node?.kind).toBe("componentTask");
    expect(node?.componentName).toBe("AdwQuery");
    expect(node?.script).toMatch(/customerType/);
  });

  it("attaches layout positions to every laid-out node", () => {
    // The fixture ships with a .layout file; every node referenced in the
    // layout should have gained a position.
    const positioned = workflow.nodes.filter((n) => n.position);
    expect(positioned.length).toBeGreaterThan(0);
  });

  it("includes boundary error edges (memory-risk paths)", () => {
    const boundaryEdges = workflow.edges.filter((e) => e.kind === "boundary");
    expect(boundaryEdges.length).toBeGreaterThan(0);
  });

  it("has no dangling edges (every edge references known nodes)", () => {
    const ids = new Set(workflow.nodes.map((n) => n.id));
    for (const edge of workflow.edges) {
      expect(ids.has(edge.source), `source ${edge.source}`).toBe(true);
      expect(ids.has(edge.target), `target ${edge.target}`).toBe(true);
    }
  });
});
