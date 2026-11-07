import { describe, expect, it } from "vitest";
import {
  parseFindingFilters,
  upstreamStates,
} from "@/features/findings/filter-validation";
import { parseBoardFilters } from "@/features/findings/board-validation";

describe("finding discovery filter parsing", () => {
  it("normalizes search and scalar empty controls consistently", () => {
    expect(
      parseFindingFilters({
        q: "  CVE_%\\  ",
        source: "",
        upstream: undefined,
      }),
    ).toEqual({ filters: { q: "CVE_%\\" } });
    expect(parseFindingFilters({ q: " \t " })).toEqual({ filters: {} });
    expect(parseBoardFilters({ q: "  package  ", source: "manual" })).toEqual({
      filters: { archive: "active", q: "package", source: "manual" },
    });
  });
  it("allows each upstream state and the valid empty manual/upstream combination", () => {
    for (const upstream of upstreamStates) {
      expect(
        parseFindingFilters({ upstream, source: "manual" }).error,
      ).toBeUndefined();
      expect(parseBoardFilters({ upstream }).error).toBeUndefined();
    }
  });
  it("rejects unknown keys, invalid enums, non-scalars, duplicate empty values, and oversized search", () => {
    for (const input of [
      null,
      [],
      "q",
      { unknown: "" },
      { q: [""] },
      { source: ["", ""] },
      { upstream: ["open", "open"] },
      { q: 4 },
      { q: "x".repeat(201) },
      { source: "github" },
      { upstream: "resolved" },
      { status: "fixed" },
      JSON.parse('{"__proto__":""}'),
    ]) {
      expect(
        parseFindingFilters(input).error,
        JSON.stringify(input),
      ).toBeTruthy();
      expect(
        parseBoardFilters(input).error,
        JSON.stringify(input),
      ).toBeTruthy();
    }
    expect(parseFindingFilters({ service: "x" }).error).toBeTruthy();
    expect(parseBoardFilters({ service: [""] }).error).toBeTruthy();
    expect(parseFindingFilters({ q: "x".repeat(200) }).error).toBeUndefined();
  });
});
