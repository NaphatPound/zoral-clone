import fs from "node:fs/promises";
import path from "node:path";
import type { Workflow } from "./types";

export const WORKFLOW_STORE_DIR = "saved-workflows";

export interface WorkflowSummary {
  id: string;
  filename: string;
  runtimeName?: string;
  nodeCount: number;
  edgeCount: number;
  modifiedAt: string;
}

const ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function isSafeWorkflowId(value: string): boolean {
  return ID_PATTERN.test(value);
}

export function slugify(value: string): string {
  const clean = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || "workflow";
}

function storeDir(): string {
  return path.join(process.cwd(), WORKFLOW_STORE_DIR);
}

async function ensureDir(): Promise<string> {
  const dir = storeDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function listWorkflowSummaries(): Promise<WorkflowSummary[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(storeDir());
  } catch {
    return [];
  }
  const summaries = await Promise.all(
    entries
      .filter((name) => name.endsWith(".json"))
      .map(async (filename) => {
        const filePath = path.join(storeDir(), filename);
        const stat = await fs.stat(filePath);
        let runtimeName: string | undefined;
        let nodeCount = 0;
        let edgeCount = 0;
        try {
          const text = await fs.readFile(filePath, "utf8");
          const parsed = JSON.parse(text) as Partial<Workflow>;
          runtimeName = parsed.meta?.runtimeName;
          nodeCount = parsed.nodes?.length ?? 0;
          edgeCount = parsed.edges?.length ?? 0;
        } catch {
          // Leave the counts at zero — file shows up but flagged as empty.
        }
        return {
          id: filename.replace(/\.json$/, ""),
          filename,
          runtimeName,
          nodeCount,
          edgeCount,
          modifiedAt: stat.mtime.toISOString(),
        };
      }),
  );
  summaries.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return summaries;
}

export async function readWorkflow(id: string): Promise<Workflow | null> {
  if (!isSafeWorkflowId(id)) return null;
  try {
    const filePath = path.join(storeDir(), `${id}.json`);
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text) as Workflow;
  } catch {
    return null;
  }
}

export async function saveWorkflow(
  workflow: Workflow,
  options?: { id?: string },
): Promise<{ id: string; filePath: string }> {
  await ensureDir();
  const slug = slugify(workflow.meta?.runtimeName ?? "workflow");
  const id =
    options?.id && isSafeWorkflowId(options.id)
      ? options.id
      : `${slug}-${Date.now()}`;
  const filePath = path.join(storeDir(), `${id}.json`);
  await fs.writeFile(filePath, JSON.stringify(workflow, null, 2), "utf8");
  return { id, filePath };
}

export async function deleteWorkflow(id: string): Promise<boolean> {
  if (!isSafeWorkflowId(id)) return false;
  try {
    await fs.unlink(path.join(storeDir(), `${id}.json`));
    return true;
  } catch {
    return false;
  }
}
