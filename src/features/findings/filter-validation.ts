import { z } from "zod";
import { severities, statuses } from "./validation";

export const findingSources = ["manual", "github_dependabot"] as const;
export const upstreamStates = [
  "open",
  "fixed",
  "dismissed",
  "auto_dismissed",
] as const;
export const sourceLabels = {
  manual: "Manual",
  github_dependabot: "Dependabot",
};
export const upstreamLabels = {
  open: "Open",
  fixed: "Fixed",
  dismissed: "Dismissed",
  auto_dismissed: "Automatically dismissed",
};
export const findingFilterShape = {
  q: z.string().trim().max(200).optional(),
  source: z.enum(findingSources).optional(),
  upstream: z.enum(upstreamStates).optional(),
  severity: z.enum(severities).optional(),
  status: z.enum(statuses).optional(),
};
const filterSchema = z.strictObject(findingFilterShape);
export type FindingFilters = z.infer<typeof filterSchema>;
export const findingFilterError =
  "Some filters are invalid or unavailable. Clear the filters and try again.";

export function normalizeFilterInput(
  input: unknown,
  keys: string[],
): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const normalized: Record<string, unknown> = Object.create(null);
  for (const [key, value] of Object.entries(input)) {
    if (!keys.includes(key) || Array.isArray(value)) return null;
    if (value === "" || value === undefined) continue;
    if (key === "q" && typeof value === "string" && !value.trim()) continue;
    normalized[key] = value;
  }
  return normalized;
}
export function parseFindingFilters(input: unknown): {
  filters: FindingFilters;
  error?: string;
} {
  const normalized = normalizeFilterInput(
    input,
    Object.keys(findingFilterShape),
  );
  const parsed = normalized && filterSchema.safeParse(normalized);
  return parsed && parsed.success
    ? { filters: parsed.data }
    : { filters: {}, error: findingFilterError };
}
