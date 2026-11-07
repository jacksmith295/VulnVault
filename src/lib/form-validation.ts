import type { z } from "zod";

// Array item issues belong to the textarea that edits the entire collection.
export function fieldErrors(issues: readonly z.core.$ZodIssue[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}
