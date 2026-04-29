import fs from "node:fs";
import path from "node:path";
import { applyLayout, expandIfElseEdges, parseWorkflowXml } from "./parser";
import type { LayoutEntry, Workflow } from "./types";

const SAMPLE_DIR = "INT_CPL_inquiry_assessment";
const SAMPLE_XML = "INT_CPL_inquiry_assessment_0.xml";
const SAMPLE_LAYOUT = "INT_CPL_inquiry_assessment_0.xml.layout";

export function loadSampleWorkflow(projectRoot: string): Workflow {
  const xml = fs.readFileSync(
    path.join(projectRoot, SAMPLE_DIR, SAMPLE_XML),
    "utf8",
  );
  const layoutJson = fs.readFileSync(
    path.join(projectRoot, SAMPLE_DIR, SAMPLE_LAYOUT),
    "utf8",
  );
  const layout = JSON.parse(layoutJson) as LayoutEntry[];
  const workflow = parseWorkflowXml(xml);
  const positioned = applyLayout(workflow, layout);
  return expandIfElseEdges(positioned);
}
