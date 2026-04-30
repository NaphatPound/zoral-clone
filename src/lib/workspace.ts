// Workspace = a folder on disk that holds workflow JSON files.
// Treat it like an IDE workspace: there's exactly one active directory at a
// time, plus a list of recently-used directories. The config file lives at
// the project root so server.js (CommonJS) can read it too.

import fs from "node:fs/promises";
import path from "node:path";

export const CONFIG_FILE = path.join(process.cwd(), ".zoral-workspace.json");
export const FALLBACK_WORKSPACE = path.join(process.cwd(), "saved-workflows");

export interface WorkspaceConfig {
  active: string;
  recent: string[];
}

function defaultConfig(): WorkspaceConfig {
  return { active: FALLBACK_WORKSPACE, recent: [] };
}

export async function readWorkspaceConfig(): Promise<WorkspaceConfig> {
  try {
    const text = await fs.readFile(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(text) as Partial<WorkspaceConfig>;
    const active =
      parsed.active && path.isAbsolute(parsed.active)
        ? parsed.active
        : FALLBACK_WORKSPACE;
    const recent = Array.isArray(parsed.recent)
      ? parsed.recent.filter(
          (entry) => typeof entry === "string" && path.isAbsolute(entry),
        )
      : [];
    return { active, recent };
  } catch {
    return defaultConfig();
  }
}

export async function getActiveWorkspace(): Promise<string> {
  const dir = (await readWorkspaceConfig()).active;
  // Ensure the directory exists so downstream readdir/writeFile don't surprise
  // the caller.
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function setActiveWorkspace(
  absolutePath: string,
): Promise<WorkspaceConfig> {
  if (!absolutePath || typeof absolutePath !== "string") {
    throw new Error("path must be a string");
  }
  const cleaned = path.resolve(absolutePath);
  if (!path.isAbsolute(cleaned)) {
    throw new Error("path must be absolute");
  }
  await fs.mkdir(cleaned, { recursive: true });
  const stat = await fs.stat(cleaned);
  if (!stat.isDirectory()) {
    throw new Error("path is not a directory");
  }

  const current = await readWorkspaceConfig();
  const recent = [
    cleaned,
    ...current.recent.filter((entry) => entry !== cleaned),
  ].slice(0, 10);
  const next: WorkspaceConfig = { active: cleaned, recent };
  await fs.writeFile(CONFIG_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function dropFromRecent(
  absolutePath: string,
): Promise<WorkspaceConfig> {
  const current = await readWorkspaceConfig();
  const recent = current.recent.filter((entry) => entry !== absolutePath);
  const next: WorkspaceConfig = { active: current.active, recent };
  await fs.writeFile(CONFIG_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}
