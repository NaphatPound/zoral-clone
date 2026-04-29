import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  generateWorkflowDocumentation,
  type WorkflowDocumentation,
} from "./documentation";
import { extractJsonObject, runGemini } from "./gemini-runner";
import type { Workflow } from "./types";

type GeminiWorkflowResponse = Partial<WorkflowDocumentation> & {
  highlights?: unknown;
};

export type GenerateWorkflowAssistantResult = {
  document: WorkflowDocumentation;
  source: "gemini" | "fallback";
  warning?: string;
  log?: string;
  model?: string;
};

const DEFAULT_TIMEOUT_MS = 180_000;

export async function generateWorkflowAssistantDocument(options: {
  workflow: Workflow;
  model?: string;
  timeoutMs?: number;
}): Promise<GenerateWorkflowAssistantResult> {
  const { workflow, model, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const fallback = generateWorkflowDocumentation(workflow);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "zoral-gemini-"));

  try {
    const prompt = buildWorkflowAssistantPrompt(workflow, fallback);
    const runResult = await runGemini({
      prompt,
      workdir: tempDir,
      timeoutMs,
      model,
    });

    if (!runResult.ok) {
      return {
        document: fallback,
        source: "fallback",
        warning: runResult.error,
        log: runResult.log,
        model,
      };
    }

    const parsed = parseWorkflowAssistantResponse(runResult.output);
    if (!parsed.ok) {
      return {
        document: fallback,
        source: "fallback",
        warning: parsed.error,
        log: runResult.log,
        model,
      };
    }

    return {
      document: normalizeWorkflowDocumentation(parsed.data, fallback),
      source: "gemini",
      log: runResult.log,
      model,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function buildWorkflowAssistantPrompt(
  workflow: Workflow,
  fallback: WorkflowDocumentation,
): string {
  const compactWorkflow = JSON.stringify(workflow);

  return [
    "You are documenting a Zoral-style low-code workflow.",
    "Use ONLY the workflow data provided in this prompt.",
    "Do not run tools, do not edit files, and do not inspect the workspace.",
    "Return exactly one JSON object and nothing else.",
    'The JSON object must have this shape: {"title": string, "filename": string, "summary": string, "highlights": string[], "markdown": string}.',
    "Requirements:",
    "- Keep the summary concise but useful for developers and analysts.",
    "- `highlights` should contain 3 to 6 short bullet strings.",
    "- `markdown` should be a complete workflow document with clear sections and readable technical detail.",
    "- Preserve key node names, branch conditions, and error/boundary routes when relevant.",
    "",
    "Existing local draft for reference:",
    JSON.stringify(fallback),
    "",
    "Workflow JSON:",
    compactWorkflow,
  ].join("\n");
}

function parseWorkflowAssistantResponse(text: string):
  | { ok: true; data: GeminiWorkflowResponse }
  | { ok: false; error: string } {
  const jsonText = extractJsonObject(text);
  if (!jsonText) {
    return { ok: false, error: "Gemini did not return a JSON object" };
  }

  try {
    const parsed = JSON.parse(jsonText) as GeminiWorkflowResponse;
    return { ok: true, data: parsed };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Failed to parse Gemini JSON: ${error.message}`
          : "Failed to parse Gemini JSON",
    };
  }
}

function normalizeWorkflowDocumentation(
  candidate: GeminiWorkflowResponse,
  fallback: WorkflowDocumentation,
): WorkflowDocumentation {
  const highlights = Array.isArray(candidate.highlights)
    ? candidate.highlights
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : fallback.highlights;

  return {
    title:
      typeof candidate.title === "string" && candidate.title.trim()
        ? candidate.title.trim()
        : fallback.title,
    filename:
      typeof candidate.filename === "string" && candidate.filename.trim()
        ? candidate.filename.trim()
        : fallback.filename,
    summary:
      typeof candidate.summary === "string" && candidate.summary.trim()
        ? candidate.summary.trim()
        : fallback.summary,
    highlights: highlights.length > 0 ? highlights : fallback.highlights,
    markdown:
      typeof candidate.markdown === "string" && candidate.markdown.trim()
        ? candidate.markdown.trim()
        : fallback.markdown,
  };
}
