"use server";

import { revalidatePath } from "next/cache";
import { getMoreBoardFindings } from "./board-data";
import type { BoardFilters, FindingStatus } from "./board-validation";
import { changeFindingStatus } from "./data";

export async function loadMoreBoardFindingsAction(
  slug: string,
  filters: BoardFilters,
  status: FindingStatus,
  cursor: string,
  scopeKey: string,
) {
  return getMoreBoardFindings(slug, filters, status, cursor, scopeKey);
}

export async function changeBoardFindingStatusAction(
  slug: string,
  serviceId: string,
  findingId: string,
  version: number,
  status: FindingStatus,
) {
  const result = await changeFindingStatus(
    slug,
    serviceId,
    findingId,
    version,
    status,
  );
  if (result.error !== undefined)
    return { error: result.error, conflict: result.conflict };
  revalidatePath(`/w/${slug}/findings`);
  revalidatePath(`/w/${slug}/services/${serviceId}`);
  revalidatePath(`/w/${slug}/services/${serviceId}/findings/${findingId}`);
  return { success: true as const };
}
