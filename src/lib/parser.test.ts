import { describe, it, expect } from "vitest";
import { applyLayout, parseWorkflowXml, toReactFlow } from "./parser";
import type { LayoutEntry } from "./types";

const MINIMAL_XML = `<?xml version="1.0" encoding="utf-8"?>
<ProcessWorkflowConfiguration
  IsLightweight="false"
  Description="demo"
  FormatVersion="4.3"
  Revision="1"
  RuntimeName="demo_runtime"
  AllowBackNavigation="false">
  <GlobalVariables>
    <add name="statusCode" value="1000" isRevertible="false" />
    <add name="selectForm" value="" isRevertible="true" />
  </GlobalVariables>
  <Items>
    <MessageStartEvent ItemId="1" NextId="2" Name="Start" />
    <ComponentTask ItemId="2" NextId="3" Name="Query">
      <ComponentDefinition ImmediateResponse="false" ValidateOutput="false">
        <Script>return query;</Script>
        <ComponentName>AdwQuery</ComponentName>
      </ComponentDefinition>
      <BoundaryEvents>
        <BoundaryErrorEvent Name="QueryError" NextId="9" IsTerminating="false" />
      </BoundaryEvents>
    </ComponentTask>
    <ScriptTask ItemId="3" NextId="4" Name="Transform">
      <ProcessItemDefinition ImmediateResponse="false" ValidateOutput="false">
        <Script>return 1;</Script>
      </ProcessItemDefinition>
    </ScriptTask>
    <EndEvent ItemId="4" Name="End" />
    <EndEvent ItemId="9" Name="ErrorEnd" />
  </Items>
</ProcessWorkflowConfiguration>`;

describe("parseWorkflowXml", () => {
  it("throws on empty input", () => {
    expect(() => parseWorkflowXml("")).toThrow(/empty input/);
  });

  it("throws on missing root element", () => {
    expect(() => parseWorkflowXml("<Other/>")).toThrow(/root/);
  });

  it("parses meta attributes", () => {
    const wf = parseWorkflowXml(MINIMAL_XML);
    expect(wf.meta.runtimeName).toBe("demo_runtime");
    expect(wf.meta.formatVersion).toBe("4.3");
    expect(wf.meta.revision).toBe("1");
    expect(wf.meta.isLightweight).toBe(false);
    expect(wf.meta.allowBackNavigation).toBe(false);
  });

  it("parses global variables with booleans", () => {
    const wf = parseWorkflowXml(MINIMAL_XML);
    expect(wf.globals).toHaveLength(2);
    const selectForm = wf.globals.find((g) => g.name === "selectForm");
    expect(selectForm?.isRevertible).toBe(true);
    const statusCode = wf.globals.find((g) => g.name === "statusCode");
    expect(statusCode?.isRevertible).toBe(false);
    expect(statusCode?.value).toBe("1000");
  });

  it("parses all node kinds", () => {
    const wf = parseWorkflowXml(MINIMAL_XML);
    const byId = Object.fromEntries(wf.nodes.map((n) => [n.id, n]));
    expect(byId["1"].kind).toBe("start");
    expect(byId["2"].kind).toBe("componentTask");
    expect(byId["3"].kind).toBe("scriptTask");
    expect(byId["4"].kind).toBe("end");
    expect(byId["2"].componentName).toBe("AdwQuery");
    expect(byId["2"].script).toBe("return query;");
    expect(byId["2"].boundaryEvents).toHaveLength(1);
    expect(byId["2"].boundaryEvents[0].nextId).toBe("9");
    expect(byId["2"].boundaryEvents[0].name).toBe("QueryError");
  });

  it("builds sequence and boundary edges", () => {
    const wf = parseWorkflowXml(MINIMAL_XML);
    const seq = wf.edges.filter((e) => e.kind === "sequence");
    const boundary = wf.edges.filter((e) => e.kind === "boundary");
    // 1→2, 2→3, 3→4
    expect(seq).toHaveLength(3);
    expect(seq.some((e) => e.source === "1" && e.target === "2")).toBe(true);
    expect(seq.some((e) => e.source === "2" && e.target === "3")).toBe(true);
    expect(seq.some((e) => e.source === "3" && e.target === "4")).toBe(true);
    // 2→9 via boundary
    expect(boundary).toHaveLength(1);
    expect(boundary[0].source).toBe("2");
    expect(boundary[0].target).toBe("9");
    expect(boundary[0].label).toBe("QueryError");
  });

  it("parses <Gateway GatewayType=...> as a gateway node with branch edges", () => {
    const xml = `<?xml version="1.0"?>
      <ProcessWorkflowConfiguration>
        <Items>
          <MessageStartEvent ItemId="1" NextId="7" Name="Start" />
          <Gateway ItemId="7" Name="checkForm" GatewayType="Exclusive">
            <GatewayConnections>
              <Connection IsElse="false" ToId="8">
                <Condition><Script>return steps.form.length &gt; 1</Script></Condition>
              </Connection>
              <Connection IsElse="true" ToId="10">
                <Condition><Script>return false</Script></Condition>
              </Connection>
            </GatewayConnections>
          </Gateway>
          <ScriptTask ItemId="8" NextId="10" Name="branchA" />
          <EndEvent ItemId="10" Name="End" />
        </Items>
      </ProcessWorkflowConfiguration>`;
    const wf = parseWorkflowXml(xml);
    const gateway = wf.nodes.find((n) => n.id === "7");
    expect(gateway?.kind).toBe("gateway");
    expect(gateway?.attributes.GatewayType).toBe("Exclusive");
    const outgoing = wf.edges.filter((e) => e.source === "7");
    expect(outgoing).toHaveLength(2);
    expect(
      outgoing.some(
        (e) =>
          e.target === "8" &&
          e.label === "if" &&
          e.condition === "return steps.form.length > 1",
      ),
    ).toBe(true);
    expect(outgoing.some((e) => e.target === "10" && e.label === "else")).toBe(
      true,
    );
  });

  it("drops edges to unknown node ids (defensive)", () => {
    const xml = `<?xml version="1.0"?>
      <ProcessWorkflowConfiguration>
        <Items>
          <MessageStartEvent ItemId="1" NextId="999" Name="Start" />
        </Items>
      </ProcessWorkflowConfiguration>`;
    const wf = parseWorkflowXml(xml);
    expect(wf.nodes).toHaveLength(1);
    expect(wf.edges).toHaveLength(0);
  });

  it("handles a single ComponentTask without wrapping it in an array", () => {
    // fast-xml-parser collapses single elements into objects — the parser
    // must still treat them as a list of length 1.
    const wf = parseWorkflowXml(MINIMAL_XML);
    const compTasks = wf.nodes.filter((n) => n.kind === "componentTask");
    expect(compTasks).toHaveLength(1);
  });
});

describe("applyLayout", () => {
  it("assigns positions by ElementId", () => {
    const wf = parseWorkflowXml(MINIMAL_XML);
    const layout: LayoutEntry[] = [
      { ElementId: "1", HorizontalPosition: 10, VerticalPosition: 20 },
      { ElementId: "2", HorizontalPosition: 200, VerticalPosition: 20 },
    ];
    const out = applyLayout(wf, layout);
    expect(out.nodes.find((n) => n.id === "1")?.position).toEqual({
      x: 10,
      y: 20,
    });
    expect(out.nodes.find((n) => n.id === "2")?.position).toEqual({
      x: 200,
      y: 20,
    });
    // Nodes not in layout keep undefined position
    expect(out.nodes.find((n) => n.id === "3")?.position).toBeUndefined();
  });

  it("is a no-op when layout is empty", () => {
    const wf = parseWorkflowXml(MINIMAL_XML);
    const out = applyLayout(wf, []);
    expect(out.nodes.every((n) => n.position === undefined)).toBe(true);
  });
});

describe("toReactFlow", () => {
  it("normalises positions so the graph starts at (0,0)", () => {
    const wf = parseWorkflowXml(MINIMAL_XML);
    const positioned = applyLayout(wf, [
      { ElementId: "1", HorizontalPosition: -500, VerticalPosition: -300 },
      { ElementId: "2", HorizontalPosition: -100, VerticalPosition: -300 },
      { ElementId: "3", HorizontalPosition: 300, VerticalPosition: -300 },
      { ElementId: "4", HorizontalPosition: 700, VerticalPosition: -300 },
      { ElementId: "9", HorizontalPosition: 700, VerticalPosition: 0 },
    ]);
    const rf = toReactFlow(positioned);
    const min = rf.nodes.reduce(
      (acc, n) => ({
        x: Math.min(acc.x, n.position.x),
        y: Math.min(acc.y, n.position.y),
      }),
      { x: Infinity, y: Infinity },
    );
    expect(min.x).toBe(0);
    expect(min.y).toBe(0);
  });

  it("marks boundary edges as animated with red stroke", () => {
    const wf = parseWorkflowXml(MINIMAL_XML);
    const rf = toReactFlow(wf);
    const boundary = rf.edges.find((e) => e.source === "2" && e.target === "9");
    expect(boundary?.animated).toBe(true);
    expect(boundary?.style?.stroke).toBe("#ef4444");
  });

  it("wires sourceHandle for gateway if/else branches only", () => {
    const xml = `<?xml version="1.0"?>
      <ProcessWorkflowConfiguration>
        <Items>
          <MessageStartEvent ItemId="1" NextId="7" Name="Start" />
          <Gateway ItemId="7" Name="g" GatewayType="Exclusive">
            <GatewayConnections>
              <Connection IsElse="false" ToId="8" />
              <Connection IsElse="true" ToId="9" />
            </GatewayConnections>
          </Gateway>
          <EndEvent ItemId="8" Name="A" />
          <EndEvent ItemId="9" Name="B" />
        </Items>
      </ProcessWorkflowConfiguration>`;
    const wf = parseWorkflowXml(xml);
    const rf = toReactFlow(wf);
    const ifEdge = rf.edges.find((e) => e.target === "8");
    const elseEdge = rf.edges.find((e) => e.target === "9");
    expect(ifEdge?.sourceHandle).toBe("if");
    expect(elseEdge?.sourceHandle).toBe("else");
    expect(ifEdge?.data?.edge.condition).toBeUndefined();
    // Non-gateway sequence edges should not set a sourceHandle.
    const startEdge = rf.edges.find((e) => e.source === "1");
    expect(startEdge?.sourceHandle).toBeUndefined();
  });

  it("carries gateway conditions into react-flow edge data", () => {
    const xml = `<?xml version="1.0"?>
      <ProcessWorkflowConfiguration>
        <Items>
          <Gateway ItemId="7" Name="g" GatewayType="Exclusive">
            <GatewayConnections>
              <Connection IsElse="false" ToId="8">
                <Condition><Script>return input.ok</Script></Condition>
              </Connection>
            </GatewayConnections>
          </Gateway>
          <EndEvent ItemId="8" Name="A" />
        </Items>
      </ProcessWorkflowConfiguration>`;
    const wf = parseWorkflowXml(xml);
    const rf = toReactFlow(wf);
    expect(rf.edges[0].data.edge.condition).toBe("return input.ok");
    expect(rf.edges[0].type).toBe("workflowEdge");
  });

  it("normalises using only nodes that actually have positions (bug fix)", () => {
    // Mixed case: some nodes are positioned (all at positive coordinates),
    // others have no layout entry. The old code blended a sentinel 0 into the
    // min calculation, which kept positioned nodes offset instead of flush
    // against origin.
    const wf = parseWorkflowXml(MINIMAL_XML);
    const positioned = applyLayout(wf, [
      { ElementId: "1", HorizontalPosition: 500, VerticalPosition: 300 },
      { ElementId: "2", HorizontalPosition: 800, VerticalPosition: 300 },
      // 3, 4, 9 intentionally not laid out
    ]);
    const rf = toReactFlow(positioned);
    const byId = Object.fromEntries(rf.nodes.map((n) => [n.id, n]));
    // Positioned nodes should be translated to origin.
    expect(byId["1"].position.x).toBe(0);
    expect(byId["1"].position.y).toBe(0);
    expect(byId["2"].position.x).toBe(300);
    expect(byId["2"].position.y).toBe(0);
  });
});

describe("numeric <Script> content", () => {
  it("still returns a string for script bodies parsed as numbers", () => {
    // fast-xml-parser converts `<Script>1</Script>` to a number by default.
    // The parser must still surface it as a string so downstream code can
    // display / save it.
    const xml = `<?xml version="1.0"?>
      <ProcessWorkflowConfiguration>
        <Items>
          <ScriptTask ItemId="1" Name="numeric">
            <ProcessItemDefinition>
              <Script>1</Script>
            </ProcessItemDefinition>
          </ScriptTask>
        </Items>
      </ProcessWorkflowConfiguration>`;
    const wf = parseWorkflowXml(xml);
    expect(wf.nodes[0].script).toBe("1");
  });
});
