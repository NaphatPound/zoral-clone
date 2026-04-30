import { NextResponse } from "next/server";
import {
  dropFromRecent,
  readWorkspaceConfig,
  setActiveWorkspace,
} from "@/lib/workspace";

export async function GET() {
  try {
    const config = await readWorkspaceConfig();
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { path?: string };
    if (!body.path) {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }
    const config = await setActiveWorkspace(body.path);
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { path?: string };
    if (!body.path) {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }
    const config = await dropFromRecent(body.path);
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
