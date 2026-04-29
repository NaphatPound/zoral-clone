import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

function sanitizeFileName(value: string): string {
  const clean = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean.endsWith(".md") ? clean : `${clean || "workflow"}.md`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      filename?: string;
      markdown?: string;
    };

    if (!body.markdown || typeof body.markdown !== "string") {
      return NextResponse.json(
        { error: "markdown is required" },
        { status: 400 },
      );
    }

    const filename = sanitizeFileName(body.filename ?? "workflow.md");
    const outputDir = path.join(process.cwd(), "generated-docs");
    const outputPath = path.join(outputDir, filename);

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputPath, body.markdown, "utf8");

    return NextResponse.json({
      ok: true,
      path: outputPath,
      filename,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown write failure";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
