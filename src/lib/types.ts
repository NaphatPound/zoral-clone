export type NodeKind =
  | "start"
  | "end"
  | "componentTask"
  | "scriptTask"
  | "gateway"
  | "condition"
  | "unknown";

export interface BoundaryEvent {
  name: string;
  description?: string;
  isTerminating: boolean;
  nextId?: string;
}

export interface WorkflowNode {
  id: string;
  kind: NodeKind;
  tag: string;
  name: string;
  description?: string;
  nextId?: string;
  componentName?: string;
  script?: string;
  processOutputScript?: string;
  boundaryEvents: BoundaryEvent[];
  position?: { x: number; y: number };
  attributes: Record<string, string>;
}

export type EdgeKind = "sequence" | "boundary";

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label?: string;
  condition?: string;
  labelOffset?: { x: number; y: number };
}

export interface GlobalVariable {
  name: string;
  value: string;
  isRevertible: boolean;
}

export interface WorkflowMeta {
  description?: string;
  formatVersion?: string;
  revision?: string;
  runtimeName?: string;
  allowBackNavigation?: boolean;
  isLightweight?: boolean;
}

export interface Workflow {
  meta: WorkflowMeta;
  globals: GlobalVariable[];
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface LayoutConnection {
  ConnectionFrom: string;
  ConnectionTo: string;
  ConnectionToId: string;
}

export interface LayoutEntry {
  ElementId: string;
  HorizontalPosition: number;
  VerticalPosition: number;
  Connections?: LayoutConnection[];
}
