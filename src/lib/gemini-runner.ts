import { spawn } from "node:child_process";

export type RunGeminiResult =
  | { ok: true; output: string; log: string }
  | { ok: false; error: string; log: string };

type RunGeminiOptions = {
  prompt: string;
  workdir: string;
  timeoutMs: number;
  model?: string;
};

const YOLO_LINE = "YOLO mode is enabled. All tool calls will be automatically approved.";

export function runGemini(options: RunGeminiOptions): Promise<RunGeminiResult> {
  const { prompt, workdir, timeoutMs, model } = options;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let killedByTimeout = false;

    const args = ["-y", "--skip-trust"];
    if (model) {
      args.push("--model", model);
    }
    args.push("--prompt", prompt);

    const child = spawn("gemini", args, {
      cwd: workdir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const settle = (result: RunGeminiResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      killedByTimeout = true;
      settle({
        ok: false,
        error: `gemini timed out after ${timeoutMs}ms`,
        log: combineLog(stdout, stderr),
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      settle({
        ok: false,
        error: `Failed to spawn gemini: ${err.message}`,
        log: combineLog(stdout, stderr),
      });
    });

    child.on("close", (code) => {
      if (settled) return;
      const log = combineLog(stdout, stderr);
      if (killedByTimeout) {
        settle({
          ok: false,
          error: `gemini timed out after ${timeoutMs}ms`,
          log,
        });
        return;
      }
      if (code !== 0) {
        settle({ ok: false, error: `gemini exited with code ${code}`, log });
        return;
      }

      settle({
        ok: true,
        output: cleanGeminiOutput(stdout),
        log,
      });
    });
  });
}

function combineLog(stdout: string, stderr: string): string {
  return `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`;
}

function cleanGeminiOutput(text: string): string {
  return text
    .split("\n")
    .filter((line) => line.trim() !== YOLO_LINE)
    .join("\n")
    .trim();
}

export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    const firstNewline = trimmed.indexOf("\n");
    if (firstNewline !== -1) {
      const withoutOpen = trimmed.slice(firstNewline + 1);
      const closingFence = withoutOpen.lastIndexOf("```");
      if (closingFence !== -1) {
        return withoutOpen.slice(0, closingFence).trim();
      }
    }
  }
  return trimmed;
}

export function extractJsonObject(text: string): string | null {
  const cleaned = stripCodeFences(cleanGeminiOutput(text));
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstBrace; index < cleaned.length; index += 1) {
    const char = cleaned[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return cleaned.slice(firstBrace, index + 1);
      }
    }
  }

  const lastBrace = cleaned.lastIndexOf("}");
  if (lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1);
  }
  return null;
}
