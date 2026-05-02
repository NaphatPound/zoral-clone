import type { Workflow, WorkflowEdge, WorkflowNode } from "./types";

export interface WorkflowDocumentation {
  title: string;
  filename: string;
  summary: string;
  highlights: string[];
  markdown: string;
}

const KIND_LABELS: Record<WorkflowNode["kind"], string> = {
  start: "start event",
  end: "end event",
  componentTask: "component task",
  scriptTask: "script task",
  gateway: "gateway",
  condition: "condition (if/else)",
  graphqlQuery: "GraphQL query (ADW Query service)",
  note: "note (sticky brief for Claude)",
  unknown: "workflow node",
};

function sanitizeFileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nodeLabel(node: WorkflowNode): string {
  return `${node.name || node.id} [${node.id}]`;
}

function summarizeText(value: string | undefined, maxLength = 120): string {
  if (!value) return "Not specified.";
  const firstLine = value
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return "Not specified.";
  if (firstLine.length <= maxLength) return firstLine;
  return `${firstLine.slice(0, maxLength - 3)}...`;
}

function formatList(values: string[]): string {
  if (values.length === 0) return "none";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function buildOutgoingMap(edges: WorkflowEdge[]): Map<string, WorkflowEdge[]> {
  const map = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    const bucket = map.get(edge.source);
    if (bucket) bucket.push(edge);
    else map.set(edge.source, [edge]);
  }
  return map;
}

function buildPrimaryFlowNarrative(
  startNode: WorkflowNode,
  nodesById: Map<string, WorkflowNode>,
  outgoingBySource: Map<string, WorkflowEdge[]>,
): string {
  const visited = new Set<string>([startNode.id]);
  const steps = [nodeLabel(startNode)];
  let current = startNode;

  while (true) {
    const outgoing = (outgoingBySource.get(current.id) ?? []).filter(
      (edge) => edge.kind === "sequence",
    );
    if (outgoing.length === 0) break;

    if (outgoing.length > 1) {
      const branchTargets = outgoing.map((edge) => {
        const target = nodesById.get(edge.target);
        const branchLabel = edge.label ? `${edge.label}: ` : "";
        return `${branchLabel}${target ? nodeLabel(target) : edge.target}`;
      });
      steps.push(`branches to ${branchTargets.join(" | ")}`);
      break;
    }

    const [edge] = outgoing;
    const target = nodesById.get(edge.target);
    if (!target) {
      steps.push(`missing target ${edge.target}`);
      break;
    }
    if (visited.has(target.id)) {
      steps.push(`${nodeLabel(target)} (loop)`);
      break;
    }

    steps.push(nodeLabel(target));
    visited.add(target.id);
    current = target;
  }

  return steps.join(" -> ");
}

function codeBlock(value: string | undefined, language = "txt"): string {
  if (!value) return "";
  return `\n\`\`\`${language}\n${value}\n\`\`\`\n`;
}

export function generateWorkflowDocumentation(
  workflow: Workflow,
): WorkflowDocumentation {
  const title = workflow.meta.runtimeName ?? "Workflow";
  const filenameBase = sanitizeFileName(title) || "workflow";
  const nodesById = new Map(workflow.nodes.map((node) => [node.id, node] as const));
  const outgoingBySource = buildOutgoingMap(workflow.edges);

  const startNodes = workflow.nodes.filter((node) => node.kind === "start");
  const endNodes = workflow.nodes.filter((node) => node.kind === "end");
  const componentTasks = workflow.nodes.filter(
    (node) => node.kind === "componentTask",
  );
  const scriptTasks = workflow.nodes.filter((node) => node.kind === "scriptTask");
  const gateways = workflow.nodes.filter((node) => node.kind === "gateway");
  const boundaryEdges = workflow.edges.filter((edge) => edge.kind === "boundary");
  const components = [
    ...new Set(
      componentTasks
        .map((node) => node.componentName)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const summary = [
    `${title} contains ${workflow.nodes.length} nodes and ${workflow.edges.length} edges.`,
    `It starts from ${formatList(startNodes.map(nodeLabel))} and reaches ${formatList(endNodes.map(nodeLabel))}.`,
    `The workflow uses ${componentTasks.length} component tasks, ${scriptTasks.length} script tasks, and ${gateways.length} gateways.`,
    components.length > 0
      ? `Integrated components include ${formatList(components)}.`
      : `No component integrations are defined yet.`,
    boundaryEdges.length > 0
      ? `There are ${boundaryEdges.length} explicit error or boundary routes.`
      : `No explicit boundary error routes are configured.`,
  ].join(" ");

  const highlights = [
    `${startNodes.length} start node(s), ${endNodes.length} end node(s), ${gateways.length} decision node(s)`,
    `${workflow.globals.length} global variable(s) and ${components.length} external component reference(s)`,
    boundaryEdges.length > 0
      ? `${boundaryEdges.length} boundary/error transition(s) detected`
      : "No boundary/error transitions detected",
  ];

  const primaryFlows =
    startNodes.length > 0
      ? startNodes.map((node) =>
          buildPrimaryFlowNarrative(node, nodesById, outgoingBySource),
        )
      : ["No start node found. The workflow may still be incomplete."];

  const decisionLines =
    gateways.length > 0
      ? gateways.map((gateway) => {
          const outgoing = outgoingBySource.get(gateway.id) ?? [];
          const branches =
            outgoing.length > 0
              ? outgoing
                  .map((edge) => {
                    const target = nodesById.get(edge.target);
                    const targetLabel = target ? nodeLabel(target) : edge.target;
                    const condition = edge.condition
                      ? ` — ${summarizeText(edge.condition, 90)}`
                      : "";
                    return `- ${edge.label ?? "next"} -> ${targetLabel}${condition}`;
                  })
                  .join("\n")
              : "- No outgoing branches defined.";
          return `### ${nodeLabel(gateway)}\n${branches}`;
        })
      : ["No decision gateways were found in this workflow."];

  const boundaryLines =
    boundaryEdges.length > 0
      ? boundaryEdges.map((edge) => {
          const source = nodesById.get(edge.source);
          const target = nodesById.get(edge.target);
          return `- ${source ? nodeLabel(source) : edge.source} routes \`${edge.label ?? "boundary"}\` to ${
            target ? nodeLabel(target) : edge.target
          }`;
        })
      : ["- No boundary handlers defined."];

  const globalsTable =
    workflow.globals.length > 0
      ? [
          "| Name | Default Value | Revertible |",
          "| --- | --- | --- |",
          ...workflow.globals.map(
            (item) =>
              `| ${item.name} | ${item.value || "(empty)"} | ${
                item.isRevertible ? "Yes" : "No"
              } |`,
          ),
        ].join("\n")
      : "No global variables are defined.";

  const nodeReference = workflow.nodes
    .map((node) => {
      const outgoing = outgoingBySource.get(node.id) ?? [];
      const nextTargets =
        outgoing.length > 0
          ? outgoing
              .map((edge) => {
                const target = nodesById.get(edge.target);
                return edge.label
                  ? `${edge.label} -> ${target ? nodeLabel(target) : edge.target}`
                  : target
                    ? nodeLabel(target)
                    : edge.target;
              })
              .join(", ")
          : "none";

      const lines = [
        `### ${nodeLabel(node)}`,
        `- Type: ${KIND_LABELS[node.kind]} (\`${node.tag}\`)`,
        `- Description: ${node.description || "Not specified."}`,
        `- Outgoing: ${nextTargets}`,
      ];

      if (node.componentName) {
        lines.push(`- Component: ${node.componentName}`);
      }
      if (Object.keys(node.attributes).length > 0) {
        lines.push(
          `- Attributes: ${Object.entries(node.attributes)
            .map(([key, value]) => `${key}=${value}`)
            .join(", ")}`,
        );
      }
      if (node.script) {
        lines.push(`- Script summary: ${summarizeText(node.script, 90)}`);
      }
      if (node.processOutputScript) {
        lines.push(
          `- Process output summary: ${summarizeText(
            node.processOutputScript,
            90,
          )}`,
        );
      }
      if (node.boundaryEvents.length > 0) {
        lines.push(
          `- Boundary events: ${node.boundaryEvents
            .map((event) => `${event.name} -> ${event.nextId ?? "unknown"}`)
            .join(", ")}`,
        );
      }

      let section = lines.join("\n");
      if (node.script) {
        section += codeBlock(node.script, "js");
      }
      if (node.processOutputScript) {
        section += codeBlock(node.processOutputScript, "js");
      }
      return section;
    })
    .join("\n\n");

  const markdown = [
    `# Workflow Documentation: ${title}`,
    "",
    "_Generated from the current workflow structure and node content._",
    "",
    "## Executive Summary",
    summary,
    "",
    "## Highlights",
    ...highlights.map((item) => `- ${item}`),
    "",
    "## Workflow Overview",
    `- Runtime name: ${workflow.meta.runtimeName ?? "Not specified"}`,
    `- Description: ${workflow.meta.description || "Not specified."}`,
    `- Format version: ${workflow.meta.formatVersion ?? "Unknown"}`,
    `- Revision: ${workflow.meta.revision ?? "Unknown"}`,
    `- Back navigation enabled: ${workflow.meta.allowBackNavigation ? "Yes" : "No"}`,
    `- Lightweight mode: ${workflow.meta.isLightweight ? "Yes" : "No"}`,
    "",
    "## Primary Flow",
    ...primaryFlows.map((flow, index) => `${index + 1}. ${flow}`),
    "",
    "## Decision Points",
    ...decisionLines,
    "",
    "## Error Handling",
    ...boundaryLines,
    "",
    "## Global Variables",
    globalsTable,
    "",
    "## External Components",
    components.length > 0
      ? components.map((component) => `- ${component}`).join("\n")
      : "- No external components referenced.",
    "",
    "## Node Reference",
    nodeReference,
    "",
  ].join("\n");

  return {
    title,
    filename: `${filenameBase}.md`,
    summary,
    highlights,
    markdown,
  };
}
