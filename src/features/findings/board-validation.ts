import { z } from "zod";
import { statuses } from "./validation";
import {
  findingFilterShape,
  findingFilterError,
  normalizeFilterInput,
} from "./filter-validation";

const identifier = z.string().min(1).max(200);
const filterSchema = z.strictObject({
  ...findingFilterShape,
  group: identifier.optional(),
  service: identifier.optional(),
  archive: z.enum(["active", "archived", "all"]).default("active"),
});
export type BoardFilters = z.infer<typeof filterSchema>;
export type FindingStatus = (typeof statuses)[number];
export const boardFilterError = findingFilterError;

export function parseBoardFilters(input: unknown): {
  filters: BoardFilters;
  error?: string;
} {
  const normalized = normalizeFilterInput(
    input,
    Object.keys(filterSchema.shape),
  );
  const parsed = normalized && filterSchema.safeParse(normalized);
  return parsed && parsed.success
    ? { filters: parsed.data }
    : { filters: { archive: "active" }, error: boardFilterError };
}
