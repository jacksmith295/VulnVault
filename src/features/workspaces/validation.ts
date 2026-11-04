import { z } from "zod";

export const workspaceSchema = z.strictObject({
  name: z.string().trim().min(2, "Use at least 2 characters for the name.").max(100, "Use no more than 100 characters for the name."),
  slug: z.string().min(3, "Use at least 3 characters for the URL slug.").max(63, "Use no more than 63 characters for the URL slug.")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters and numbers separated by single hyphens."),
});

export function workspaceFormInput(form: FormData) {
  const input: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    // React adds transport fields to progressively enhanced Server Action forms.
    if (key.startsWith("$ACTION_")) continue;
    if (Object.hasOwn(input, key)) return null;
    Object.defineProperty(input, key, { value, enumerable: true });
  }
  return input;
}

export function suggestSlug(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 63).replace(/-$/, "");
}
