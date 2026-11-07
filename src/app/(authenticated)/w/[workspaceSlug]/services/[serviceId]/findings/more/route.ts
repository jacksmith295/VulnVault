import { type NextRequest, NextResponse } from "next/server";
import { getMoreServiceFindings } from "@/features/findings/service-list-data";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string; serviceId: string }> },
) {
  const { workspaceSlug, serviceId } = await params;
  const query = request.nextUrl.searchParams;
  const filters: Record<string, string | string[]> = Object.create(null);
  for (const key of new Set(query.keys())) {
    if (["cursor", "scope"].includes(key)) continue;
    const values = query.getAll(key);
    filters[key] = values.length === 1 ? values[0] : values;
  }
  const single = (key: string) => {
    const values = query.getAll(key);
    return values.length === 1 ? values[0] : undefined;
  };
  const result = await getMoreServiceFindings(
    workspaceSlug,
    serviceId,
    filters,
    single("cursor"),
    single("scope"),
  );
  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
