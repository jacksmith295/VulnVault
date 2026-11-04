import { z } from "zod";

const repositoryUrl = z.string().trim().max(2048, "Repository URLs must be no more than 2,048 characters.").transform((value, context) => {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash
      || value.includes("?") || value.includes("#") || !url.pathname.replaceAll("/", "")) throw new Error();
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    context.addIssue({ code: "custom", message: "Use HTTP or HTTPS repository URLs with a path and no credentials, query strings, or fragments." });
    return z.NEVER;
  }
});

export const serviceSchema = z.strictObject({
  name: z.string().trim().min(2, "Use at least 2 characters for the name.").max(100, "Use no more than 100 characters for the name."),
  description: z.string().trim().max(5000, "Use no more than 5,000 characters for the description.").default("").transform((value) => value || null),
  repositoryUrls: z.array(repositoryUrl).max(20, "Use no more than 20 repository URLs.").superRefine((urls, context) => {
    if (new Set(urls).size !== urls.length) context.addIssue({ code: "custom", message: "Remove duplicate repository URLs." });
  }).default([]),
});
export const versionSchema = z.number().int().min(1).max(2147483646);

export function serviceFormInput(form: FormData) {
  const input: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("$ACTION_")) continue;
    if (Object.hasOwn(input, key)) return null;
    Object.defineProperty(input, key, { value, enumerable: true, writable: true });
  }
  if (typeof input.repositoryUrls === "string") input.repositoryUrls = input.repositoryUrls.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
  return input;
}
