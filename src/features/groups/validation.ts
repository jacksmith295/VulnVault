import { z } from "zod";
const name = z
  .string()
  .trim()
  .min(2, "Use at least 2 characters for the name.")
  .max(100, "Use no more than 100 characters for the name.")
  .refine(
    (value) => value.toLowerCase() !== "everyone",
    "Everyone is reserved for the default group.",
  );
const ids = z
  .array(z.string().min(1).max(200))
  .max(1000)
  .refine(
    (values) => new Set(values).size === values.length,
    "Remove duplicate selections.",
  );
export const createGroupSchema = z.strictObject({ name });
export const editGroupSchema = z.strictObject({ name, memberIds: ids });
export const serviceAccessSchema = z.strictObject({
  groupIds: ids,
  confirmDefault: z.boolean().optional(),
});
function parseForm(form: FormData, repeated: string) {
  const input: Record<string, unknown> = { [repeated]: [] };
  for (const [key, value] of form.entries()) {
    if (key.startsWith("$ACTION_")) continue;
    if (key === repeated) {
      (input[repeated] as unknown[]).push(value);
      continue;
    }
    if (Object.hasOwn(input, key)) return null;
    Object.defineProperty(input, key, {
      value,
      enumerable: true,
      writable: true,
    });
  }
  if (input.confirmDefault === "on" || input.confirmDefault === "true")
    input.confirmDefault = true;
  return input;
}
export function groupFormInput(form: FormData) {
  return parseForm(form, "memberIds");
}
export function serviceAccessFormInput(form: FormData) {
  return parseForm(form, "groupIds");
}
export function createGroupFormInput(form: FormData) {
  const input: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("$ACTION_")) continue;
    if (Object.hasOwn(input, key)) return null;
    Object.defineProperty(input, key, { value, enumerable: true });
  }
  return input;
}
