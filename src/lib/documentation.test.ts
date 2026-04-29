import { describe, expect, it } from "vitest";
import { generateWorkflowDocumentation } from "./documentation";
import { parseWorkflowXml } from "./parser";

const BASE_XML = `<?xml version="1.0" encoding="utf-8"?>
<ProcessWorkflowConfiguration
  Description="demo workflow"
  FormatVersion="4.3"
  Revision="1"
  RuntimeName="demo_runtime"
  AllowBackNavigation="false">
  <GlobalVariables>
    <add name="statusCode" value="1000" isRevertible="false" />
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
      <ProcessItemDefinition>
        <Script>return input;</Script>
      </ProcessItemDefinition>
    </ScriptTask>
    <EndEvent ItemId="4" Name="End" />
    <EndEvent ItemId="9" Name="ErrorEnd" />
  </Items>
</ProcessWorkflowConfiguration>`;

describe("generateWorkflowDocumentation", () => {
  it("builds a summary, filename, and markdown document", () => {
    const workflow = parseWorkflowXml(BASE_XML);
    const doc = generateWorkflowDocumentation(workflow);

    expect(doc.title).toBe("demo_runtime");
    expect(doc.filename).toBe("demo-runtime.md");
    expect(doc.summary).toContain("demo_runtime contains 5 nodes and 4 edges");
    expect(doc.highlights[0]).toContain("1 start node(s)");
    expect(doc.markdown).toContain("# Workflow Documentation: demo_runtime");
    expect(doc.markdown).toContain("## Executive Summary");
    expect(doc.markdown).toContain("## Global Variables");
    expect(doc.markdown).toContain("AdwQuery");
    expect(doc.markdown).toContain("QueryError");
    expect(doc.markdown).toContain("### Query [2]");
  });

  it("includes gateway branch conditions in the markdown", () => {
    const workflow = parseWorkflowXml(`<?xml version="1.0"?>
      <ProcessWorkflowConfiguration RuntimeName="branching_flow">
        <Items>
          <StartEvent ItemId="1" NextId="7" Name="Start" />
          <Gateway ItemId="7" Name="checkForm" GatewayType="Exclusive">
            <GatewayConnections>
              <Connection IsElse="false" ToId="8">
                <Condition><Script>return input.valid</Script></Condition>
              </Connection>
              <Connection IsElse="true" ToId="9">
                <Condition><Script>return false</Script></Condition>
              </Connection>
            </GatewayConnections>
          </Gateway>
          <EndEvent ItemId="8" Name="Approved" />
          <EndEvent ItemId="9" Name="Rejected" />
        </Items>
      </ProcessWorkflowConfiguration>`);

    const doc = generateWorkflowDocumentation(workflow);

    expect(doc.markdown).toContain("## Decision Points");
    expect(doc.markdown).toContain("### checkForm [7]");
    expect(doc.markdown).toContain("if -> Approved [8]");
    expect(doc.markdown).toContain("return input.valid");
    expect(doc.markdown).toContain("else -> Rejected [9]");
  });
});
