export type NodeKind =
  | "start"
  | "end"
  | "componentTask"
  | "scriptTask"
  | "gateway"
  | "condition"
  | "graphqlQuery"
  | "note"
  | "unknown";

export type NoteAttachmentKind = "image" | "video" | "audio" | "file";

export interface NoteAttachment {
  filename: string;
  kind: NoteAttachmentKind;
  size: number;
  mime: string;
}

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
  scriptMode?: "js" | "blocks";
  scriptBlocksJson?: string;
  processOutputScript?: string;
  boundaryEvents: BoundaryEvent[];
  position?: { x: number; y: number };
  attributes: Record<string, string>;
  graphqlEndpoint?: string;
  graphqlQuery?: string;
  graphqlVariables?: string;
  graphqlOperationName?: string;
  graphqlApiKey?: string;
  graphqlSavedQueryId?: string;
  noteText?: string;
  noteAttachments?: NoteAttachment[];
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

export interface WorkflowSample {
  name: string;
  description?: string;
  input: unknown;
  output?: unknown;
}

export interface WorkflowMeta {
  description?: string;
  formatVersion?: string;
  revision?: string;
  runtimeName?: string;
  allowBackNavigation?: boolean;
  isLightweight?: boolean;
  tags?: string[];
  inputSchema?: unknown;
  outputSchema?: unknown;
  samples?: WorkflowSample[];
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
