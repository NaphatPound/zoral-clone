"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  type Connection,
  Controls,
  type HandleType,
  MiniMap,
  type Edge,
  type Node,
  type OnConnectStartParams,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from "reactflow";
import {
  generateWorkflowDocumentation,
  type WorkflowDocumentation,
} from "@/lib/documentation";
import type { Workflow, WorkflowEdge, WorkflowNode } from "@/lib/types";
import { toReactFlow } from "@/lib/parser";
import NodeCard from "./NodeCard";
import DetailsPanel from "./DetailsPanel";
import Legend from "./Legend";
import RunPanel from "./RunPanel";
import StaticGraphPreview from "./StaticGraphPreview";
import TerminalPanel from "./TerminalPanel";
import WorkflowAssistantPanel from "./WorkflowAssistantPanel";
import WorkflowEdgeView, { type FlowEdgeData } from "./WorkflowEdge";
import {
  statusByNodeId,
  type ExecutionResult,
  type StepStatus,
} from "@/lib/workflow-runtime";

const nodeTypes = { zoralNode: NodeCard };
const edgeTypes = { workflowEdge: WorkflowEdgeView };
type FlowNodeData = {
  label: string;
  node: WorkflowNode;
  dim?: boolean;
  runStatus?: StepStatus;
};
type FlowNode = Node<FlowNodeData>;
type FlowEdge = Edge<FlowEdgeData>;
type SelectedItem =
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | null;
type CreateMenuState = {
  x: number;
  y: number;
  flowPosition: { x: number; y: number };
  pendingConnection?: PendingConnection;
};
type PendingConnection = {
  nodeId: string;
  handleId: string | null;
  handleType: HandleType;
};
type NodeTemplate = {
  key: string;
  label: string;
  hint: string;
  create: (id: string, position: { x: number; y: number }) => WorkflowNode;
};
type AssistantGenerationStatus = {
  state: "idle" | "loading" | "ready" | "fallback" | "error";
  source: "local" | "gemini" | "fallback";
  message?: string;
};
type WorkflowAssistantResponse = {
  document: WorkflowDocumentation;
  source: "gemini" | "fallback";
  warning?: string;
  log?: string;
  model?: string;
};

const NODE_TEMPLATES: NodeTemplate[] = [
  {
    key: "start",
    label: "Start Event",
    hint: "Entry point for a workflow branch.",
    create: (id, position) => ({
      id,
      kind: "start",
      tag: "MessageStartEvent",
      name: `Start ${id}`,
      position,
      boundaryEvents: [],
      attributes: {},
    }),
  },
  {
    key: "component",
    label: "Component Task",
    hint: "Call a component with input/output scripts.",
    create: (id, position) => ({
      id,
      kind: "componentTask",
      tag: "ComponentTask",
      name: `Component ${id}`,
      description: "New component task",
      componentName: "NewComponent",
      script: "return input;",
      processOutputScript: "return output;",
      position,
      boundaryEvents: [],
      attributes: {
        ImmediateResponse: "false",
        ValidateOutput: "false",
      },
    }),
  },
  {
    key: "script",
    label: "Script Task",
    hint: "Run custom code inside the workflow.",
    create: (id, position) => ({
      id,
      kind: "scriptTask",
      tag: "ScriptTask",
      name: `Script ${id}`,
      description: "New script task",
      script: "return null;",
      position,
      boundaryEvents: [],
      attributes: {
        ImmediateResponse: "false",
        ValidateOutput: "false",
      },
    }),
  },
  {
    key: "gateway",
    label: "Exclusive Gateway",
    hint: "Branch the workflow with if/else conditions.",
    create: (id, position) => ({
      id,
      kind: "gateway",
      tag: "Gateway",
      name: `Gateway ${id}`,
      position,
      boundaryEvents: [],
      attributes: {
        GatewayType: "Exclusive",
      },
    }),
  },
  {
    key: "condition",
    label: "Condition (if/else)",
    hint: "Inline branch label — connect a gateway in and a target out.",
    create: (id, position) => ({
      id,
      kind: "condition",
      tag: "If",
      name: "If",
      description: "return true;",
      position,
      boundaryEvents: [],
      attributes: { branch: "if" },
    }),
  },
  {
    key: "graphqlQuery",
    label: "GraphQL Query (ADW)",
    hint: "Send a GraphQL query to the ADW Query service and pass the data field downstream.",
    create: (id, position) => ({
      id,
      kind: "graphqlQuery",
      tag: "GraphqlQueryTask",
      name: `GraphQL ${id}`,
      description: "Calls /api/external/graphql on the ADW Query service.",
      position,
      boundaryEvents: [],
      attributes: {},
      graphqlEndpoint: "http://localhost:3001/api/external/graphql",
      graphqlQuery: "{\n  __schema { queryType { name } }\n}",
    }),
  },
  {
    key: "end",
    label: "End Event",
    hint: "Terminate the workflow path.",
    create: (id, position) => ({
      id,
      kind: "end",
      tag: "EndEvent",
      name: `End ${id}`,
      position,
      boundaryEvents: [],
      attributes: {},
    }),
  },
  {
    key: "note",
    label: "Note (for Claude)",
    hint: "Decorative sticky note. Attach images/video/audio/text and ask Claude to turn the brief into code.",
    create: (id, position) => ({
      id,
      kind: "note",
      tag: "Note",
      name: `Note ${id}`,
      noteText: "",
      noteAttachments: [],
      position,
      boundaryEvents: [],
      attributes: {},
    }),
  },
];

function downloadJson(workflow: Workflow) {
  const blob = new Blob([JSON.stringify(workflow, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const name = workflow.meta.runtimeName ?? "workflow";
  a.href = url;
  a.download = `${name}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadTextFile(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const LAYOUT_COLUMN_WIDTH = 320;
const LAYOUT_ROW_HEIGHT = 150;

// Layered BFS layout: roots at column 0, downstream nodes shift right by their
// longest path from any root. Within a column, nodes stack vertically. Cycles
// are tolerated — once a node has been placed at a level, it isn't revisited.
function computeAutoLayout(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): Map<string, { x: number; y: number }> {
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();
  for (const node of nodes) {
    incoming.set(node.id, new Set());
    outgoing.set(node.id, new Set());
  }
  for (const edge of edges) {
    if (!incoming.has(edge.target) || !outgoing.has(edge.source)) continue;
    incoming.get(edge.target)!.add(edge.source);
    outgoing.get(edge.source)!.add(edge.target);
  }

  const level = new Map<string, number>();
  const queue: string[] = [];
  for (const node of nodes) {
    if ((incoming.get(node.id)?.size ?? 0) === 0) {
      level.set(node.id, 0);
      queue.push(node.id);
    }
  }
  // Fallback: if every node has an incoming edge (pure cycle), seed with the
  // first node so the layout still produces something.
  if (queue.length === 0 && nodes.length > 0) {
    level.set(nodes[0].id, 0);
    queue.push(nodes[0].id);
  }

  while (queue.length > 0) {
    const id = queue.shift()!;
    const current = level.get(id)!;
    for (const next of outgoing.get(id) ?? []) {
      const seen = level.get(next);
      if (seen === undefined || seen < current + 1) {
        level.set(next, current + 1);
        queue.push(next);
      }
    }
  }

  // Any node not reached (disconnected component) drops at the right edge in
  // its own column so it's still visible.
  let maxLevel = 0;
  for (const value of level.values()) {
    if (value > maxLevel) maxLevel = value;
  }
  const orphanLevel = maxLevel + 1;
  for (const node of nodes) {
    if (!level.has(node.id)) {
      level.set(node.id, orphanLevel);
    }
  }

  const byLevel = new Map<number, string[]>();
  for (const node of nodes) {
    const lvl = level.get(node.id)!;
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push(node.id);
  }

  const positions = new Map<string, { x: number; y: number }>();
  let tallestColumn = 0;
  for (const ids of byLevel.values()) {
    if (ids.length > tallestColumn) tallestColumn = ids.length;
  }
  const columnHeight = Math.max(1, tallestColumn) * LAYOUT_ROW_HEIGHT;

  for (const [lvl, ids] of byLevel) {
    const total = ids.length;
    const usedHeight = total * LAYOUT_ROW_HEIGHT;
    const startY = (columnHeight - usedHeight) / 2;
    ids.forEach((id, index) => {
      positions.set(id, {
        x: lvl * LAYOUT_COLUMN_WIDTH,
        y: startY + index * LAYOUT_ROW_HEIGHT,
      });
    });
  }

  return positions;
}

function syncWorkflowPositions(
  workflow: Workflow,
  nodes: FlowNode[],
): Workflow {
  const positions = new Map(
    nodes.map((node) => [node.id, { ...node.position }] as const),
  );
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) => ({
      ...node,
      position: positions.get(node.id) ?? node.position,
    })),
  };
}

function makeFlowNode(node: WorkflowNode): FlowNode {
  return {
    id: node.id,
    position: node.position ?? { x: 0, y: 0 },
    data: { label: node.name, node },
    type: "zoralNode",
  };
}

function makeFlowEdge(edge: WorkflowEdge): FlowEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle:
      edge.label === "if" || edge.label === "else" ? edge.label : undefined,
    type: "workflowEdge",
    animated: edge.kind === "boundary",
    style: edge.kind === "boundary" ? { stroke: "#ef4444" } : undefined,
    data: { edge },
  };
}

function updateWorkflowNode(
  workflow: Workflow,
  nodeId: string,
  patch: Partial<
    Pick<
      WorkflowNode,
      | "name"
      | "description"
      | "componentName"
      | "script"
      | "processOutputScript"
      | "graphqlEndpoint"
      | "graphqlQuery"
      | "graphqlVariables"
      | "graphqlOperationName"
      | "graphqlApiKey"
      | "graphqlSavedQueryId"
    >
  >,
): Workflow {
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) =>
      node.id === nodeId ? { ...node, ...patch } : node,
    ),
  };
}

function updateWorkflowEdge(
  workflow: Workflow,
  edgeId: string,
  patch: Partial<Pick<WorkflowEdge, "label" | "condition" | "labelOffset">>,
): Workflow {
  return {
    ...workflow,
    edges: workflow.edges.map((edge) =>
      edge.id === edgeId ? { ...edge, ...patch } : edge,
    ),
  };
}

function nextNodeId(workflow: Workflow): string {
  const numericIds = workflow.nodes
    .map((node) => Number(node.id))
    .filter((value) => Number.isInteger(value));
  if (numericIds.length > 0) {
    let candidate = Math.max(...numericIds) + 1;
    while (workflow.nodes.some((node) => node.id === String(candidate))) {
      candidate += 1;
    }
    return String(candidate);
  }
  let candidate = workflow.nodes.length + 1;
  let fallback = `node-${candidate}`;
  while (workflow.nodes.some((node) => node.id === fallback)) {
    candidate += 1;
    fallback = `node-${candidate}`;
  }
  return fallback;
}

function edgeIdFromConnection(connection: Connection): string | null {
  if (!connection.source || !connection.target) return null;
  return `${connection.source}->${connection.target}:sequence:`;
}

function clientPointFromEvent(
  event: MouseEvent | TouchEvent,
): { x: number; y: number } | null {
  if ("clientX" in event) {
    return { x: event.clientX, y: event.clientY };
  }
  const touch = event.changedTouches[0] ?? event.touches[0];
  if (!touch) return null;
  return { x: touch.clientX, y: touch.clientY };
}

function buildPendingConnection(
  params: OnConnectStartParams,
): PendingConnection | null {
  if (!params.nodeId || !params.handleType) return null;
  return {
    nodeId: params.nodeId,
    handleId: params.handleId,
    handleType: params.handleType,
  };
}

function connectionFromPending(
  pending: PendingConnection,
  newNodeId: string,
): Connection {
  if (pending.handleType === "source") {
    return {
      source: pending.nodeId,
      sourceHandle: pending.handleId,
      target: newNodeId,
      targetHandle: null,
    };
  }
  return {
    source: newNodeId,
    sourceHandle: null,
    target: pending.nodeId,
    targetHandle: pending.handleId,
  };
}

export default function GraphCanvas({
  workflow,
  workflowId,
}: {
  workflow: Workflow;
  workflowId?: string;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const pendingConnectionRef = useRef<PendingConnection | null>(null);
  const connectionCompletedRef = useRef(false);
  const suppressNextPaneClickRef = useRef(false);
  const initialFlow = useMemo(() => toReactFlow(workflow), [workflow]);
  const [workflowState, setWorkflowState] = useState<Workflow>(() =>
    syncWorkflowPositions(workflow, initialFlow.nodes as FlowNode[]),
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNodeData>(
    initialFlow.nodes as FlowNode[],
  );
  const [edges, setEdges] = useEdgesState<FlowEdgeData>(
    initialFlow.edges as FlowEdge[],
  );
  const [selection, setSelection] = useState<SelectedItem>(null);
  const [search, setSearch] = useState("");
  const [createMenu, setCreateMenu] = useState<CreateMenuState | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{
    state: "idle" | "saving" | "saved" | "error";
    message?: string;
  }>({ state: "idle" });
  const [reactFlowInstance, setReactFlowInstance] = useState<
    ReactFlowInstance<FlowNodeData, FlowEdgeData> | null
  >(null);
  const [workflowSaveStatus, setWorkflowSaveStatus] = useState<{
    state: "idle" | "saving" | "saved" | "error";
    message?: string;
  }>({ state: "idle" });
  const [runOpen, setRunOpen] = useState(false);
  const [runResult, setRunResult] = useState<ExecutionResult | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalWidth, setTerminalWidth] = useState(420);
  const [rightPanelWidth, setRightPanelWidth] = useState(400);
  const rightDragStartRef = useRef<{ x: number; width: number } | null>(null);
  const [workflowChangeFlash, setWorkflowChangeFlash] = useState<string | null>(null);
  const runStatuses = useMemo(
    () => (runResult ? statusByNodeId(runResult) : new Map<string, StepStatus>()),
    [runResult],
  );
  const documentation = useMemo(
    () => generateWorkflowDocumentation(workflowState),
    [workflowState],
  );
  const [assistantDocument, setAssistantDocument] =
    useState<WorkflowDocumentation>(documentation);
  const [assistantGenerationStatus, setAssistantGenerationStatus] =
    useState<AssistantGenerationStatus>({
      state: "idle",
      source: "local",
    });

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!assistantOpen) {
      setAssistantDocument(documentation);
      setAssistantGenerationStatus({ state: "idle", source: "local" });
    }
  }, [assistantOpen, documentation]);

  // Replace every piece of in-canvas state with a freshly-loaded workflow.
  // Used both for the initial mount and for re-syncs from disk (auto-watch
  // and the manual Reload button). Camera position is left alone — ReactFlow
  // only fitView's once at mount, so the user's pan/zoom is preserved.
  const applyWorkflow = useCallback(
    (next: Workflow) => {
      const nextFlow = toReactFlow(next);
      setWorkflowState(
        syncWorkflowPositions(next, nextFlow.nodes as FlowNode[]),
      );
      setNodes(nextFlow.nodes as FlowNode[]);
      setEdges(nextFlow.edges as FlowEdge[]);
      setSelection(null);
      setCreateMenu(null);
      pendingConnectionRef.current = null;
      connectionCompletedRef.current = false;
      suppressNextPaneClickRef.current = false;
      setAssistantOpen(false);
      setAssistantDocument(generateWorkflowDocumentation(next));
      setAssistantGenerationStatus({ state: "idle", source: "local" });
      setSaveStatus({ state: "idle" });
      setRunResult(null);
    },
    [setEdges, setNodes],
  );

  useEffect(() => {
    applyWorkflow(workflow);
  }, [workflow, applyWorkflow]);

  const [reloadStatus, setReloadStatus] = useState<{
    state: "idle" | "loading" | "ok" | "error";
    message?: string;
  }>({ state: "idle" });

  const reloadFromDisk = useCallback(
    async (silent = false) => {
      if (!workflowId) return;
      if (!silent) setReloadStatus({ state: "loading", message: "Reloading..." });
      try {
        const response = await fetch(
          `/api/workflows/${encodeURIComponent(workflowId)}`,
        );
        const payload = (await response.json()) as {
          workflow?: Workflow;
          error?: string;
        };
        if (!response.ok || !payload.workflow) {
          throw new Error(payload.error ?? "Failed to load workflow");
        }
        applyWorkflow(payload.workflow);
        if (!silent) {
          setReloadStatus({
            state: "ok",
            message: "Reloaded from disk.",
          });
        }
      } catch (error) {
        setReloadStatus({
          state: "error",
          message:
            error instanceof Error ? error.message : "Failed to reload",
        });
      }
    },
    [workflowId, applyWorkflow],
  );

  // Watch saved-workflows/ via the WS endpoint exposed by server.js so the
  // canvas can flash a banner when Claude Code (or any other tool) writes a
  // new graph. If the changed file matches the workflow currently loaded
  // (?workflow=<id>), auto-reload it into the canvas state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/workflow-watch`);
    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data) as { type?: string; filePath?: string };
        if (msg.type !== "workflow:add" && msg.type !== "workflow:change") return;

        const name = msg.filePath?.split("/").pop() ?? "workflow";
        const idFromFile = name.replace(/\.json$/, "");
        const matchesActive = !!workflowId && idFromFile === workflowId;

        setWorkflowChangeFlash(
          matchesActive
            ? `saved-workflows/${name} updated — reloading...`
            : `saved-workflows/${name} updated`,
        );
        window.setTimeout(() => setWorkflowChangeFlash(null), 6000);

        if (matchesActive) {
          void reloadFromDisk(true);
        }
      } catch {
        // ignore non-JSON
      }
    });
    return () => {
      try { ws.close(); } catch { /* ignore */ }
    };
  }, [workflowId, reloadFromDisk]);

  const openCreateMenu = (
    clientPoint: { x: number; y: number },
    pendingConnection?: PendingConnection,
  ) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const flowPosition = reactFlowInstance
      ? reactFlowInstance.screenToFlowPosition(clientPoint)
      : {
          x: clientPoint.x - (rect?.left ?? 0),
          y: clientPoint.y - (rect?.top ?? 0),
        };
    const rawX = clientPoint.x - (rect?.left ?? 0);
    const rawY = clientPoint.y - (rect?.top ?? 0);
    const maxX = Math.max(12, (rect?.width ?? 320) - 292);
    const maxY = Math.max(12, (rect?.height ?? 360) - 380);

    setSelection(null);
    setEdgeSelection(null);
    setCreateMenu({
      x: Math.min(Math.max(12, rawX), maxX),
      y: Math.min(Math.max(12, rawY), maxY),
      flowPosition,
      pendingConnection,
    });
  };

  const setEdgeSelection = (edgeId: string | null) => {
    setEdges((current) =>
      current.map((edge) =>
        edge.selected === (edge.id === edgeId)
          ? edge
          : { ...edge, selected: edge.id === edgeId },
      ),
    );
  };

  const handleNodeSelection = (nodeId: string) => {
    setSelection({ type: "node", id: nodeId });
    setEdgeSelection(null);
    setCreateMenu(null);
  };

  const handleEdgeSelection = (edgeId: string) => {
    setSelection({ type: "edge", id: edgeId });
    setEdgeSelection(edgeId);
    setCreateMenu(null);
  };

  const clearSelection = () => {
    setSelection(null);
    setEdgeSelection(null);
    setCreateMenu(null);
  };

  const handleSaveWorkflow = async () => {
    setWorkflowSaveStatus({ state: "saving", message: "Saving workflow..." });
    try {
      const response = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow: workflowState }),
      });
      const payload = (await response.json()) as {
        id?: string;
        path?: string;
        error?: string;
      };
      if (!response.ok || !payload.id) {
        throw new Error(payload.error ?? "Failed to save workflow");
      }
      setWorkflowSaveStatus({
        state: "saved",
        message: `Saved as ${payload.id}`,
      });
    } catch (error) {
      setWorkflowSaveStatus({
        state: "error",
        message:
          error instanceof Error ? error.message : "Failed to save workflow",
      });
    }
  };

  const handleAutoLayout = () => {
    const positions = computeAutoLayout(workflowState.nodes, workflowState.edges);
    if (positions.size === 0) return;
    setWorkflowState((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        const next = positions.get(node.id);
        return next ? { ...node, position: next } : node;
      }),
    }));
    setNodes((current) =>
      current.map((node) => {
        const next = positions.get(node.id);
        if (!next) return node;
        const nextData = { ...node.data.node, position: next };
        return { ...node, position: next, data: { ...node.data, node: nextData } };
      }),
    );
    setCreateMenu(null);
    requestAnimationFrame(() => {
      reactFlowInstance?.fitView({ padding: 0.2, duration: 400 });
    });
  };

  const openAssistant = () => {
    setCreateMenu(null);
    setAssistantDocument(documentation);
    setAssistantOpen(true);
    setAssistantGenerationStatus({
      state: "idle",
      source: "local",
      message: "Showing local draft. Click Generate to run Gemini CLI.",
    });
    setSaveStatus({ state: "idle" });
  };

  const handleGenerate = () => {
    setAssistantGenerationStatus({
      state: "loading",
      source: "local",
      message: "Generating with Gemini CLI...",
    });
    setSaveStatus({ state: "idle" });
    void requestAssistantDocument(workflowState);
  };

  const requestAssistantDocument = async (currentWorkflow: Workflow) => {
    const localDocument = generateWorkflowDocumentation(currentWorkflow);
    setAssistantDocument(localDocument);

    try {
      const response = await fetch("/api/workflow-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow: currentWorkflow,
        }),
      });
      const payload = (await response.json()) as
        | WorkflowAssistantResponse
        | { error?: string };

      if (!response.ok || !("document" in payload)) {
        throw new Error(
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Failed to generate assistant output",
        );
      }

      setAssistantDocument(payload.document);
      if (payload.source === "gemini") {
        setAssistantGenerationStatus({
          state: "ready",
          source: "gemini",
          message: payload.model
            ? `Generated by Gemini CLI (${payload.model}).`
            : "Generated by Gemini CLI.",
        });
        return;
      }

      setAssistantGenerationStatus({
        state: "fallback",
        source: "fallback",
        message:
          payload.warning ??
          "Gemini CLI was unavailable, so the local fallback summary is shown.",
      });
    } catch (error) {
      setAssistantDocument(localDocument);
      setAssistantGenerationStatus({
        state: "error",
        source: "local",
        message:
          error instanceof Error
            ? error.message
            : "Failed to generate assistant output",
      });
    }
  };

  const saveDocumentation = async () => {
    setSaveStatus({ state: "saving", message: "Saving documentation..." });
    try {
      const response = await fetch("/api/workflow-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: assistantDocument.filename,
          markdown: assistantDocument.markdown,
        }),
      });
      const payload = (await response.json()) as {
        path?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save documentation");
      }
      setSaveStatus({
        state: "saved",
        message: `Saved to ${payload.path}`,
      });
    } catch (error) {
      setSaveStatus({
        state: "error",
        message:
          error instanceof Error ? error.message : "Failed to save documentation",
      });
    }
  };

  const handleEdgeChange = (
    edgeId: string,
    patch: Partial<Pick<WorkflowEdge, "label" | "condition" | "labelOffset">>,
  ) => {
    setWorkflowState((current) => updateWorkflowEdge(current, edgeId, patch));
    setEdges((current) =>
      current.map((edge) => {
        if (edge.id !== edgeId) return edge;
        const currentEdge = edge.data!.edge;
        return {
          ...edge,
          data: {
            ...edge.data,
            edge: { ...currentEdge, ...patch },
          },
        };
      }),
    );
  };

  const selectedNode =
    selection?.type === "node"
      ? workflowState.nodes.find((node) => node.id === selection.id) ?? null
      : null;
  const selectedEdge =
    selection?.type === "edge"
      ? workflowState.edges.find((edge) => edge.id === selection.id) ?? null
      : null;

  const addNodeFromTemplate = (template: NodeTemplate) => {
    const menu = createMenu;
    if (!menu) return;
    const nodeId = nextNodeId(workflowState);
    const node = template.create(nodeId, menu.flowPosition);
    setWorkflowState((current) => ({
      ...current,
      nodes: [...current.nodes, node],
    }));
    setNodes((current) => [...current, makeFlowNode(node)]);
    if (menu.pendingConnection) {
      handleConnect(connectionFromPending(menu.pendingConnection, nodeId));
    }
    handleNodeSelection(nodeId);
  };

  const handleConnect = (connection: Connection) => {
    connectionCompletedRef.current = true;
    pendingConnectionRef.current = null;
    const edgeId = edgeIdFromConnection(connection);
    if (!edgeId || !connection.source || !connection.target) return;
    const sourceId = connection.source;
    const targetId = connection.target;
    const workflowEdge: WorkflowEdge = {
      id: edgeId,
      source: sourceId,
      target: targetId,
      kind: "sequence",
    };

    setWorkflowState((current) => {
      if (current.edges.some((edge) => edge.id === edgeId)) {
        return current;
      }
      return {
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === sourceId && node.kind !== "gateway"
            ? { ...node, nextId: targetId }
            : node,
        ),
        edges: [...current.edges, workflowEdge],
      };
    });
    setEdges((current) => {
      if (current.some((edge) => edge.id === edgeId)) return current;
      return [...current, makeFlowEdge(workflowEdge)];
    });
  };

  const { visibleNodes, visibleEdges } = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = new Set<string>();
    const edgeMatches = new Set<string>();

    for (const n of nodes) {
      const node = n.data.node;
      if (
        node.id.includes(term) ||
        node.name.toLowerCase().includes(term) ||
        (node.componentName ?? "").toLowerCase().includes(term)
      ) {
        matches.add(node.id);
      }
    }

    for (const edge of edges) {
      const text = `${edge.data!.edge.label ?? ""} ${
        edge.data!.edge.condition ?? ""
      }`.toLowerCase();
      if (term && text.includes(term)) {
        edgeMatches.add(edge.id);
        matches.add(edge.source);
        matches.add(edge.target);
      }
    }

    const rfNodes: FlowNode[] = nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        dim: term ? !matches.has(n.id) : false,
        runStatus: runStatuses.get(n.id),
      },
    }));
    const rfEdges: FlowEdge[] = edges.map((e) => ({
      ...e,
      data: {
        edge: e.data!.edge,
        onSelect: handleEdgeSelection,
        onChange: handleEdgeChange,
      },
      style:
        !term || edgeMatches.has(e.id) || (matches.has(e.source) && matches.has(e.target))
          ? e.style
          : { ...(e.style ?? {}), opacity: 0.15 },
    }));
    return { visibleNodes: rfNodes, visibleEdges: rfEdges };
  }, [edges, nodes, search, runStatuses]);

  return (
    <div
      className="flex h-screen w-screen"
      style={{
        display: "flex",
        width: "100vw",
        height: "100vh",
        color: "#e2e8f0",
        paddingLeft: terminalOpen ? terminalWidth : 0,
        transition: "padding-left 120ms ease",
        boxSizing: "border-box",
      }}
    >
      <TerminalPanel
        open={terminalOpen}
        width={terminalWidth}
        onClose={() => setTerminalOpen(false)}
        onResize={setTerminalWidth}
      />
      {workflowChangeFlash ? (
        <div
          style={{
            position: "fixed",
            top: 96,
            left: terminalOpen ? terminalWidth + 16 : 16,
            zIndex: 35,
            borderRadius: 8,
            border: "1px solid rgba(34,197,94,0.45)",
            background: "rgba(15,23,42,0.94)",
            padding: "8px 14px",
            color: "#bbf7d0",
            fontSize: 12,
            boxShadow: "0 10px 24px rgba(15,23,42,0.45)",
          }}
        >
          ✓ {workflowChangeFlash} —{" "}
          <a
            href="/workflows"
            style={{ color: "#86efac", textDecoration: "underline" }}
          >
            open list
          </a>
        </div>
      ) : null}
      <div
        ref={canvasRef}
        className="relative flex-1"
        style={{ position: "relative", flex: 1, minWidth: 0, background: "#0b1020" }}
      >
        <div
          className="absolute right-4 top-4 z-10 flex items-center gap-2"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() => setTerminalOpen((prev) => !prev)}
            className="rounded-md border border-slate-500 bg-slate-800 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-slate-700"
            style={{
              borderRadius: 8,
              border: "1px solid rgba(100,116,139,0.95)",
              background: terminalOpen ? "#0f172a" : "#1e293b",
              padding: "10px 14px",
              color: "#e2e8f0",
              fontSize: 14,
              fontWeight: 600,
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.18)",
            }}
            title="Toggle terminal panel"
          >
            {terminalOpen ? "⟨ Hide Terminal" : "⟩ Terminal"}
          </button>
          <button
            type="button"
            onClick={openAssistant}
            className="rounded-md border border-red-500 bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-red-500"
            style={{
              borderRadius: 8,
              border: "1px solid #ef4444",
              background: "#dc2626",
              padding: "10px 14px",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.18)",
            }}
          >
            AI Assistant
          </button>
          <button
            type="button"
            onClick={handleAutoLayout}
            className="rounded-md border border-indigo-400 bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-indigo-500"
            style={{
              borderRadius: 8,
              border: "1px solid #818cf8",
              background: "#4f46e5",
              padding: "10px 14px",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.18)",
            }}
          >
            Auto Layout
          </button>
          <button
            type="button"
            onClick={() => setRunOpen(true)}
            className="rounded-md border border-amber-400 bg-amber-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-amber-500"
            style={{
              borderRadius: 8,
              border: "1px solid #fbbf24",
              background: "#d97706",
              padding: "10px 14px",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.18)",
            }}
          >
            ▶ Run
          </button>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes…"
            className="rounded-md border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 outline-none backdrop-blur focus:border-sky-400"
            style={{
              width: 210,
              borderRadius: 8,
              border: "1px solid rgba(71, 85, 105, 0.95)",
              background: "rgba(15, 23, 42, 0.88)",
              padding: "10px 12px",
              color: "#e2e8f0",
              fontSize: 14,
              outline: "none",
            }}
          />
          {workflowId ? (
            <button
              type="button"
              onClick={() => void reloadFromDisk(false)}
              disabled={reloadStatus.state === "loading"}
              title={`Reload saved-workflows/${workflowId}.json from disk`}
              className="rounded-md border border-cyan-400 bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                borderRadius: 8,
                border: "1px solid #22d3ee",
                background: "#0e7490",
                padding: "10px 14px",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 600,
                boxShadow: "0 10px 24px rgba(15, 23, 42, 0.18)",
              }}
            >
              {reloadStatus.state === "loading" ? "Reloading..." : "↻ Reload"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSaveWorkflow}
            disabled={workflowSaveStatus.state === "saving"}
            className="rounded-md border border-emerald-400 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              borderRadius: 8,
              border: "1px solid #34d399",
              background: "#059669",
              padding: "10px 14px",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.18)",
            }}
          >
            {workflowSaveStatus.state === "saving"
              ? "Saving..."
              : "Save Workflow"}
          </button>
          <a
            href="/workflows"
            className="rounded-md border border-slate-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-slate-700"
            style={{
              borderRadius: 8,
              border: "1px solid rgba(100, 116, 139, 0.95)",
              background: "rgba(15, 23, 42, 0.85)",
              padding: "10px 14px",
              color: "#e2e8f0",
              fontSize: 14,
              fontWeight: 600,
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.18)",
              textDecoration: "none",
            }}
          >
            Workflows
          </a>
          <button
            type="button"
            onClick={() => downloadJson(workflowState)}
            className="rounded-md border border-sky-400 bg-sky-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-sky-500"
            style={{
              borderRadius: 8,
              border: "1px solid #38bdf8",
              background: "#0284c7",
              padding: "10px 14px",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.18)",
            }}
          >
            Download JSON
          </button>
        </div>
        {workflowSaveStatus.message || reloadStatus.message ? (
          <div
            style={{
              position: "absolute",
              top: 60,
              right: 16,
              zIndex: 20,
              borderRadius: 8,
              border: `1px solid ${
                workflowSaveStatus.state === "error" || reloadStatus.state === "error"
                  ? "#fb7185"
                  : "rgba(71, 85, 105, 0.95)"
              }`,
              background: "rgba(15, 23, 42, 0.92)",
              padding: "6px 10px",
              fontSize: 12,
              color:
                workflowSaveStatus.state === "error" || reloadStatus.state === "error"
                  ? "#fda4af"
                  : workflowSaveStatus.state === "saved" || reloadStatus.state === "ok"
                    ? "#86efac"
                    : "#cbd5e1",
              backdropFilter: "blur(12px)",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {workflowSaveStatus.message ? <div>{workflowSaveStatus.message}</div> : null}
            {reloadStatus.message ? <div>{reloadStatus.message}</div> : null}
          </div>
        ) : null}
        {createMenu ? (
          <div
            className="absolute z-20 w-[280px] rounded-xl border border-slate-700 bg-slate-950/95 p-2 shadow-2xl backdrop-blur"
            style={{ left: createMenu.x, top: createMenu.y }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <div className="px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">
              {createMenu.pendingConnection ? "Create And Connect" : "Create Node"}
            </div>
            <div className="mb-2 px-2 text-[11px] text-slate-500">
              {createMenu.pendingConnection
                ? "Select a template to create a new node and attach the dragged connection."
                : "Select a workflow template to insert at this canvas position."}
            </div>
            <div className="space-y-1">
              {NODE_TEMPLATES.map((template) => (
                <button
                  key={template.key}
                  type="button"
                  onClick={() => addNodeFromTemplate(template)}
                  className="block w-full rounded-lg border border-slate-800 px-3 py-2 text-left hover:border-sky-500 hover:bg-slate-900"
                >
                  <div className="text-sm font-medium text-slate-100">
                    {template.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {template.hint}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <Legend />
        {runOpen ? (
          <RunPanel
            workflow={workflowState}
            onClose={() => setRunOpen(false)}
            onResult={setRunResult}
          />
        ) : null}
        {assistantOpen ? (
          <WorkflowAssistantPanel
            document={assistantDocument}
            onClose={() => setAssistantOpen(false)}
            onDownload={() =>
              downloadTextFile(
                assistantDocument.filename,
                assistantDocument.markdown,
                "text/markdown",
              )
            }
            onGenerate={handleGenerate}
            onSave={saveDocumentation}
            saveStatus={saveStatus}
            generationStatus={assistantGenerationStatus}
          />
        ) : null}
        {!hydrated ? <StaticGraphPreview workflow={workflowState} /> : null}
        <div
          style={{
            position: "relative",
            zIndex: 10,
            width: "100%",
            height: "100%",
            opacity: hydrated ? 1 : 0,
          }}
        >
          <ReactFlow
            nodes={visibleNodes}
            edges={visibleEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            connectionRadius={60}
            onInit={setReactFlowInstance}
            onConnect={handleConnect}
            onConnectStart={(_, params) => {
              pendingConnectionRef.current = buildPendingConnection(params);
              connectionCompletedRef.current = false;
            }}
            onConnectEnd={(event) => {
              const pending = pendingConnectionRef.current;
              const completed = connectionCompletedRef.current;
              pendingConnectionRef.current = null;
              connectionCompletedRef.current = false;
              if (completed || !pending) return;

              const target = event.target;
              if (
                target instanceof Element &&
                (target.closest(".react-flow__node") ||
                  target.closest(".react-flow__handle") ||
                  target.closest(".react-flow__edge"))
              ) {
                return;
              }

              const point = clientPointFromEvent(event);
              if (!point) return;
              suppressNextPaneClickRef.current = true;
              openCreateMenu(point, pending);
            }}
            onNodesChange={onNodesChange}
            onNodeClick={(_, node) => {
              handleNodeSelection(node.id);
            }}
            onPaneContextMenu={(event) => {
              event.preventDefault();
              openCreateMenu({ x: event.clientX, y: event.clientY });
            }}
            onEdgeClick={(_, edge) => {
              handleEdgeSelection(edge.id);
            }}
            onNodeDragStop={(_, node) => {
              setWorkflowState((current) =>
                syncWorkflowPositions(current, [node as FlowNode]),
              );
            }}
            onPaneClick={() => {
              if (suppressNextPaneClickRef.current) {
                suppressNextPaneClickRef.current = false;
                return;
              }
              clearSelection();
            }}
          >
            <Background color="#1f2937" gap={24} />
            <MiniMap pannable zoomable />
            <Controls />
          </ReactFlow>
        </div>
      </div>
      {selection ? (
        <aside
          style={{
            position: "relative",
            width: rightPanelWidth,
            flexShrink: 0,
            borderLeft: "1px solid rgba(51, 65, 85, 0.95)",
            background: "#0f172a",
            color: "#e2e8f0",
          }}
        >
          <div
            onMouseDown={(event) => {
              rightDragStartRef.current = {
                x: event.clientX,
                width: rightPanelWidth,
              };
              const onMove = (e: MouseEvent) => {
                const start = rightDragStartRef.current;
                if (!start) return;
                // Dragging the left edge to the LEFT widens the panel.
                const next = Math.min(800, Math.max(280, start.width - (e.clientX - start.x)));
                setRightPanelWidth(next);
              };
              const onUp = () => {
                rightDragStartRef.current = null;
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
            title="Drag to resize"
            style={{
              position: "absolute",
              top: 0,
              left: -3,
              width: 6,
              height: "100%",
              cursor: "col-resize",
              background: "transparent",
              zIndex: 22,
            }}
          />
          <DetailsPanel
            node={selectedNode}
            edge={selectedEdge}
            onAskClaude={(noteNode) => {
              // Open terminal (the panel auto-launches `claude` CLI on
              // first open); then queue a prompt that points Claude at
              // the on-disk note.md plus any attachments.
              setTerminalOpen(true);
              const noteId = noteNode.id;
              const targetHint = noteNode.name
                ? ` for the node "${noteNode.name}" (id: ${noteId})`
                : "";
              const prompt =
                `Read the brief at notes/${noteId}/note.md and every file ` +
                `next to it in notes/${noteId}/, then implement the workflow ` +
                `it describes${targetHint}. The note may contain images, ` +
                `videos, audio clips, or text — treat each attachment as part ` +
                `of the requirement.\n`;
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("zoral:terminal-send", {
                    detail: { text: prompt },
                  }),
                );
              }
            }}
            onNodeChange={(patch) => {
              if (selection?.type !== "node") return;
              setWorkflowState((current) =>
                updateWorkflowNode(current, selection.id, patch),
              );
              setNodes((current) =>
                current.map((node) => {
                  if (node.id !== selection.id) return node;
                  const nextNode = { ...node.data.node, ...patch };
                  return {
                    ...node,
                    data: {
                      ...node.data,
                      label: nextNode.name,
                      node: nextNode,
                    },
                  };
                }),
              );
            }}
            onEdgeChange={(patch) => {
              if (selection?.type !== "edge") return;
              handleEdgeChange(selection.id, patch);
            }}
          />
        </aside>
      ) : null}
    </div>
  );
}
