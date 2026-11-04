import { z } from "zod";

export const severities = [
  "critical",
  "high",
  "medium",
  "low",
  "informational",
] as const;
export const statuses = [
  "new",
  "triaged",
  "in_progress",
  "resolved",
  "rejected",
  "accepted_risk",
] as const;
export const severityLabels = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  informational: "Informational",
};
export const statusLabels = {
  new: "New",
  triaged: "Triaged",
  in_progress: "In progress",
  resolved: "Resolved",
  rejected: "Rejected",
  accepted_risk: "Accepted risk",
};
const referenceUrl = z
  .string()
  .trim()
  .max(2048, "Reference URLs must be no more than 2,048 characters.")
  .transform((value, context) => {
    try {
      const url = new URL(value);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error();
      const normalized = url.toString();
      if (normalized.length > 2048) throw new Error();
      return normalized;
    } catch {
      context.addIssue({
        code: "custom",
        message:
          "Use HTTP or HTTPS reference URLs without credentials, up to 2,048 characters.",
      });
      return z.NEVER;
    }
  });
const fields = {
  title: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters for the title.")
    .max(200, "Use no more than 200 characters for the title."),
  description: z
    .string()
    .trim()
    .min(1, "Enter a description.")
    .max(20000, "Use no more than 20,000 characters for the description."),
  severity: z.enum(severities, { error: "Select a severity." }),
  remediationNotes: z
    .string()
    .trim()
    .max(20000, "Use no more than 20,000 characters for remediation notes.")
    .default("")
    .transform((value) => value || null),
  referenceUrls: z
    .array(referenceUrl)
    .max(20, "Use no more than 20 reference URLs.")
    .superRefine((urls, context) => {
      if (new Set(urls).size !== urls.length)
        context.addIssue({
          code: "custom",
          message: "Remove duplicate reference URLs.",
        });
    })
    .default([]),
};
export const createFindingSchema = z.strictObject(fields);
export const editFindingSchema = z.strictObject({
  ...fields,
  status: z.enum(statuses),
});
export function findingFormInput(form: FormData) {
  const input: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("$ACTION_")) continue;
    if (Object.hasOwn(input, key)) return null;
    Object.defineProperty(input, key, {
      value,
      enumerable: true,
      writable: true,
    });
  }
  if (typeof input.referenceUrls === "string") {
    input.referenceUrls = input.referenceUrls
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean);
  }
  return input;
}
