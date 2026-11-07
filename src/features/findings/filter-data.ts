import "server-only";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { finding, findingSource } from "@/db/schema";
import type { FindingFilters } from "./filter-validation";

// strpos treats %, _ and backslashes as literal characters rather than LIKE patterns.
export function findingFilterCondition(filters: FindingFilters) {
  const contains = (
    column:
      | typeof finding.title
      | typeof findingSource.packageName
      | typeof findingSource.ghsaId
      | typeof findingSource.cveId,
  ) => sql`strpos(lower(coalesce(${column}, '')), lower(${filters.q})) > 0`;
  return and(
    filters.q
      ? or(
          contains(finding.title),
          contains(findingSource.packageName),
          contains(findingSource.ghsaId),
          contains(findingSource.cveId),
        )
      : undefined,
    filters.source === "manual"
      ? isNull(findingSource.findingId)
      : filters.source
        ? eq(findingSource.kind, filters.source)
        : undefined,
    filters.upstream ? eq(findingSource.state, filters.upstream) : undefined,
    filters.severity ? eq(finding.severity, filters.severity) : undefined,
    filters.status ? eq(finding.status, filters.status) : undefined,
  );
}
