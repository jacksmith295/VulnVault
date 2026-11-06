import { type NextRequest, NextResponse } from "next/server";
import { getMoreBoardFindings } from "@/features/findings/board-data";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string }> },
) {
  const { workspaceSlug } = await params;
  const query = request.nextUrl.searchParams;
  const filters: Record<string, string | string[]> = Object.create(null);
  for (const key of new Set(query.keys())) {
    if (["column", "cursor", "scope"].includes(key)) continue;
    const values = query.getAll(key);
    filters[key] = values.length === 1 ? values[0] : values;
  }
  const single = (key: string) => {
    const values = query.getAll(key);
    return values.length === 1 ? values[0] : undefined;
  };
  const result = await getMoreBoardFindings(
    workspaceSlug,
    filters,
    single("column"),
    single("cursor"),
    single("scope"),
  );
  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
