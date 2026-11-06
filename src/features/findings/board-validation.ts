import { z } from "zod";
import { severities, statuses } from "./validation";

const identifier = z.string().min(1).max(200);
const filterSchema = z.strictObject({
  group: identifier.optional(),
  service: identifier.optional(),
  severity: z.enum(severities).optional(),
  status: z.enum(statuses).optional(),
  archive: z.enum(["active", "archived", "all"]).default("active"),
});
export type BoardFilters = z.infer<typeof filterSchema>;
export type FindingStatus = (typeof statuses)[number];
export const boardFilterError =
  "Some filters are invalid or unavailable. Clear the filters and try again.";

export function parseBoardFilters(input: unknown): {
  filters: BoardFilters;
  error?: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { filters: { archive: "active" }, error: boardFilterError };
  const normalized: Record<string, unknown> = Object.create(null);
  for (const [key, value] of Object.entries(input)) {
    if (!["group", "service", "severity", "status", "archive"].includes(key))
      return { filters: { archive: "active" }, error: boardFilterError };
    if (value === "" || value === undefined) continue;
    normalized[key] = value;
  }
  const parsed = filterSchema.safeParse(normalized);
  return parsed.success
    ? { filters: parsed.data }
    : { filters: { archive: "active" }, error: boardFilterError };
}
