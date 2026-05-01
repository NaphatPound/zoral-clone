import { NextResponse } from "next/server";
import { buildCatalog } from "@/lib/catalog";
import { corsPreflight, resolveBaseUrl, withCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return corsPreflight();
}

export async function GET(request: Request) {
  const baseUrl = resolveBaseUrl(request);
  try {
    const catalog = await buildCatalog(baseUrl);
    const response = NextResponse.json(catalog);
    response.headers.set("Cache-Control", "no-store");
    return withCors(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "failed to build catalog";
    return withCors(
      NextResponse.json({ error: message }, { status: 500 }),
    );
  }
}
