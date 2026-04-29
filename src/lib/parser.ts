import { XMLParser } from "fast-xml-parser";
import type {
  BoundaryEvent,
  EdgeKind,
  GlobalVariable,
  LayoutEntry,
  NodeKind,
  Workflow,
  WorkflowEdge,
  WorkflowMeta,
  WorkflowNode,
} from "./types";

const TAG_TO_KIND: Record<string, NodeKind> = {
  MessageStartEvent: "start",
  StartEvent: "start",
  EndEvent: "end",
  ComponentTask: "componentTask",
  ScriptTask: "scriptTask",
  Gateway: "gateway",
  ExclusiveGateway: "gateway",
  InclusiveGateway: "gateway",
  ParallelGateway: "gateway",
};

interface GatewayBranch {
  targetId: string;
  isElse: boolean;
  condition?: string;
}

// Fields we do not want to copy into node.attributes (they are either
// already lifted onto the node or they are bulky children).
const IGNORED_FIELDS = new Set([
  "ItemId",
  "NextId",
  "Name",
  "Description",
  "Dependencies",
  "ComponentDefinition",
  "ProcessItemDefinition",
  "BoundaryEvents",
  "GatewayConnections",
]);

function makeParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: false,
    allowBooleanAttributes: true,
    preserveOrder: false,
    trimValues: true,
    isArray: (name) => {
      // These nodes can legitimately appear 0..n times; force arrays so we
      // don't have to branch on "is this an object or a list" downstream.
      return (
        name === "add" ||
        name === "BoundaryErrorEvent" ||
        name === "string" ||
        name === "Connection"
      );
    },
  });
}

function toBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

function coerceText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  // fast-xml-parser coerces numeric / boolean tag bodies to primitives by
  // default; we still want them as strings for display + downstream use.
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function extractText(node: unknown): string | undefined {
  const direct = coerceText(node);
  if (direct !== undefined) return direct;
  if (typeof node === "object" && node !== null) {
    const obj = node as Record<string, unknown>;
    const textChild = coerceText(obj["#text"]);
    if (textChild !== undefined) return textChild;
    const scriptChild = obj.Script;
    const scriptDirect = coerceText(scriptChild);
    if (scriptDirect !== undefined) return scriptDirect;
    if (scriptChild && typeof scriptChild === "object") {
      const inner = coerceText(
        (scriptChild as Record<string, unknown>)["#text"],
      );
      if (inner !== undefined) return inner;
    }
  }
  return undefined;
}

function parseGlobalVariables(raw: unknown): GlobalVariable[] {
  if (!raw || typeof raw !== "object") return [];
  const node = raw as { add?: unknown };
  const adds = Array.isArray(node.add) ? (node.add as unknown[]) : [];
  const result: GlobalVariable[] = [];
  for (const entry of adds) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, string | undefined>;
    if (!obj.name) continue;
    result.push({
      name: obj.name,
      value: obj.value ?? "",
      isRevertible: toBool(obj.isRevertible, false),
    });
  }
  return result;
}

function parseBoundaryEvents(raw: unknown): BoundaryEvent[] {
  if (!raw || typeof raw !== "object") return [];
  const node = raw as { BoundaryErrorEvent?: unknown };
  const events = Array.isArray(node.BoundaryErrorEvent)
    ? (node.BoundaryErrorEvent as unknown[])
    : [];
  const result: BoundaryEvent[] = [];
  for (const entry of events) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, string | undefined>;
    result.push({
      name: obj.Name ?? "",
      description: obj.Description,
      isTerminating: toBool(obj.IsTerminating, false),
      nextId: obj.NextId,
    });
  }
  return result;
}

function extractScripts(item: Record<string, unknown>): {
  script?: string;
  processOutputScript?: string;
  componentName?: string;
} {
  const container =
    (item.ComponentDefinition as Record<string, unknown> | undefined) ??
    (item.ProcessItemDefinition as Record<string, unknown> | undefined);
  if (!container) return {};
  return {
    script: extractText(container.Script),
    processOutputScript: extractText(container.ProcessOutputScript),
    componentName: extractText(container.ComponentName),
  };
}

function stringifyAttributes(
  item: Record<string, unknown>,
): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(item)) {
    if (IGNORED_FIELDS.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "string") attrs[key] = value;
    else if (typeof value === "number" || typeof value === "boolean")
      attrs[key] = String(value);
  }
  return attrs;
}

function parseGatewayBranches(raw: unknown): GatewayBranch[] {
  if (!raw || typeof raw !== "object") return [];
  const node = raw as { Connection?: unknown };
  const connections = Array.isArray(node.Connection)
    ? (node.Connection as unknown[])
    : [];
  const result: GatewayBranch[] = [];
  for (const entry of connections) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const targetId = typeof obj.ToId === "string" ? obj.ToId : undefined;
    if (!targetId) continue;
    result.push({
      targetId,
      isElse: toBool(typeof obj.IsElse === "string" ? obj.IsElse : undefined),
      condition: extractText(obj.Condition),
    });
  }
  return result;
}

function nodeFromItem(
  tag: string,
  item: Record<string, unknown>,
): { node: WorkflowNode; branches: GatewayBranch[] } | null {
  const id = typeof item.ItemId === "string" ? item.ItemId : undefined;
  if (!id) return null;
  const kind = TAG_TO_KIND[tag] ?? "unknown";
  const { script, processOutputScript, componentName } = extractScripts(item);
  const branches =
    kind === "gateway" ? parseGatewayBranches(item.GatewayConnections) : [];
  const node: WorkflowNode = {
    id,
    tag,
    kind,
    name: typeof item.Name === "string" ? item.Name : tag,
    description:
      typeof item.Description === "string" ? item.Description : undefined,
    nextId: typeof item.NextId === "string" ? item.NextId : undefined,
    componentName,
    script,
    processOutputScript,
    boundaryEvents: parseBoundaryEvents(item.BoundaryEvents),
    attributes: stringifyAttributes(item),
  };
  return { node, branches };
}

function parseItems(rawItems: unknown): {
  nodes: WorkflowNode[];
  branchesByNodeId: Map<string, GatewayBranch[]>;
} {
  const nodes: WorkflowNode[] = [];
  const branchesByNodeId = new Map<string, GatewayBranch[]>();
  if (!rawItems || typeof rawItems !== "object") {
    return { nodes, branchesByNodeId };
  }
  for (const [tag, value] of Object.entries(
    rawItems as Record<string, unknown>,
  )) {
    const entries = Array.isArray(value) ? (value as unknown[]) : [value];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const parsed = nodeFromItem(tag, entry as Record<string, unknown>);
      if (!parsed) continue;
      nodes.push(parsed.node);
      if (parsed.branches.length > 0) {
        branchesByNodeId.set(parsed.node.id, parsed.branches);
      }
    }
  }
  return { nodes, branchesByNodeId };
}

function buildEdges(
  nodes: WorkflowNode[],
  branchesByNodeId: Map<string, GatewayBranch[]>,
): WorkflowEdge[] {
  const edges: WorkflowEdge[] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();

  const push = (
    source: string,
    target: string,
    kind: EdgeKind,
    options?: { label?: string; condition?: string },
  ) => {
    // Drop edges that point at a node we don't know about (keeps the graph
    // consistent with the nodes we actually render).
    if (!nodeIds.has(source) || !nodeIds.has(target)) return;
    const id = `${source}->${target}:${kind}:${options?.label ?? ""}`;
    if (seen.has(id)) return;
    seen.add(id);
    edges.push({
      id,
      source,
      target,
      kind,
      label: options?.label,
      condition: options?.condition,
    });
  };

  for (const node of nodes) {
    if (node.nextId) push(node.id, node.nextId, "sequence");
    for (const be of node.boundaryEvents) {
      if (be.nextId) {
        push(node.id, be.nextId, "boundary", { label: be.name });
      }
    }
    const branches = branchesByNodeId.get(node.id);
    if (branches) {
      for (const branch of branches) {
        push(node.id, branch.targetId, "sequence", {
          label: branch.isElse ? "else" : "if",
          condition: branch.condition,
        });
      }
    }
  }
  return edges;
}

function parseMeta(root: Record<string, unknown>): WorkflowMeta {
  return {
    description:
      typeof root.Description === "string" ? root.Description : undefined,
    formatVersion:
      typeof root.FormatVersion === "string" ? root.FormatVersion : undefined,
    revision: typeof root.Revision === "string" ? root.Revision : undefined,
    runtimeName:
      typeof root.RuntimeName === "string" ? root.RuntimeName : undefined,
    allowBackNavigation: toBool(
      typeof root.AllowBackNavigation === "string"
        ? root.AllowBackNavigation
        : undefined,
      false,
    ),
    isLightweight: toBool(
      typeof root.IsLightweight === "string" ? root.IsLightweight : undefined,
      false,
    ),
  };
}

export function parseWorkflowXml(xml: string): Workflow {
  if (typeof xml !== "string" || xml.trim() === "") {
    throw new Error("parseWorkflowXml: empty input");
  }
  const parser = makeParser();
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const root = parsed.ProcessWorkflowConfiguration as
    | Record<string, unknown>
    | undefined;
  if (!root) {
    throw new Error(
      "parseWorkflowXml: root <ProcessWorkflowConfiguration> not found",
    );
  }
  const globals = parseGlobalVariables(root.GlobalVariables);
  const { nodes, branchesByNodeId } = parseItems(root.Items);
  const edges = buildEdges(nodes, branchesByNodeId);
  return {
    meta: parseMeta(root),
    globals,
    nodes,
    edges,
  };
}

// Promote each gateway if/else edge to a first-class condition node so the
// in-canvas label becomes a draggable node with its own handles. The condition
// node sits between the gateway and the original target; the surrounding edges
// are plain unlabeled sequence edges.
export function expandIfElseEdges(workflow: Workflow): Workflow {
  const positionsById = new Map(
    workflow.nodes
      .filter((n) => n.position)
      .map((n) => [n.id, n.position!] as const),
  );
  const newNodes: WorkflowNode[] = [...workflow.nodes];
  const newEdges: WorkflowEdge[] = [];

  for (const edge of workflow.edges) {
    const isBranch =
      edge.kind === "sequence" &&
      (edge.label === "if" || edge.label === "else");
    if (!isBranch) {
      newEdges.push(edge);
      continue;
    }
    const conditionId = `${edge.source}-${edge.label}-${edge.target}`;
    if (newNodes.some((n) => n.id === conditionId)) continue;

    const sourcePos = positionsById.get(edge.source);
    const targetPos = positionsById.get(edge.target);
    const position =
      sourcePos && targetPos
        ? {
            x: (sourcePos.x + targetPos.x) / 2,
            y: (sourcePos.y + targetPos.y) / 2,
          }
        : sourcePos
          ? { x: sourcePos.x + 220, y: sourcePos.y }
          : undefined;

    const conditionNode: WorkflowNode = {
      id: conditionId,
      kind: "condition",
      tag: edge.label === "if" ? "If" : "Else",
      name: edge.label === "if" ? "If" : "Else",
      description: edge.condition,
      position,
      boundaryEvents: [],
      attributes: {
        branch: edge.label!,
      },
    };
    newNodes.push(conditionNode);

    newEdges.push({
      id: `${edge.source}->${conditionId}:sequence:`,
      source: edge.source,
      target: conditionId,
      kind: "sequence",
    });
    newEdges.push({
      id: `${conditionId}->${edge.target}:sequence:`,
      source: conditionId,
      target: edge.target,
      kind: "sequence",
    });
  }

  return { ...workflow, nodes: newNodes, edges: newEdges };
}

export function applyLayout(workflow: Workflow, layout: LayoutEntry[]): Workflow {
  const byId = new Map<string, LayoutEntry>();
  for (const entry of layout) {
    if (entry && typeof entry.ElementId === "string") {
      byId.set(entry.ElementId, entry);
    }
  }
  const nodes = workflow.nodes.map((node) => {
    const entry = byId.get(node.id);
    if (!entry) return node;
    return {
      ...node,
      position: {
        x: Number(entry.HorizontalPosition) || 0,
        y: Number(entry.VerticalPosition) || 0,
      },
    };
  });
  return { ...workflow, nodes };
}

export function toReactFlow(workflow: Workflow) {
  // Normalise so the positioned nodes start at the origin. We intentionally
  // ignore nodes without positions here — including them as 0 would pin the
  // min to 0 and leave every positioned node offset by its real coordinates.
  const positioned = workflow.nodes.filter(
    (n): n is WorkflowNode & { position: { x: number; y: number } } =>
      !!n.position,
  );
  let minX = 0;
  let minY = 0;
  if (positioned.length > 0) {
    minX = positioned[0].position.x;
    minY = positioned[0].position.y;
    for (const n of positioned) {
      if (n.position.x < minX) minX = n.position.x;
      if (n.position.y < minY) minY = n.position.y;
    }
  }

  const rfNodes = workflow.nodes.map((n, i) => {
    const fallbackX = (i % 6) * 220;
    const fallbackY = Math.floor(i / 6) * 160;
    const x = n.position ? n.position.x - minX : fallbackX;
    const y = n.position ? n.position.y - minY : fallbackY;
    return {
      id: n.id,
      position: { x, y },
      data: { label: n.name, node: n },
      type: "zoralNode",
    };
  });
  const nodesById = new Map(workflow.nodes.map((n) => [n.id, n] as const));
  const rfEdges = workflow.edges.map((e) => {
    const sourceIsGateway = nodesById.get(e.source)?.kind === "gateway";
    const sourceHandle =
      sourceIsGateway && (e.label === "if" || e.label === "else")
        ? e.label
        : undefined;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle,
      type: "workflowEdge",
      animated: e.kind === "boundary",
      style: e.kind === "boundary" ? { stroke: "#ef4444" } : undefined,
      data: { edge: e },
    };
  });
  return { nodes: rfNodes, edges: rfEdges };
}
