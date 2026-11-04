import { describe, expect, it } from "vitest";
import { serviceSchema } from "@/features/services/validation";

describe("repository URL length after normalization", () => {
  const prefix = "https://example.com/";

  it("rejects short Unicode input that expands beyond the stored URL limit", () => {
    const url = prefix + "é".repeat(1000);
    expect(url.length).toBeLessThan(2048);
    expect(new URL(url).toString().length).toBeGreaterThan(2048);
    expect(
      serviceSchema.safeParse({ name: "Service", repositoryUrls: [url] })
        .success,
    ).toBe(false);
  });

  it("accepts normalized URLs at the limit and rejects those above it", () => {
    const url = prefix + "a".repeat(2048 - prefix.length);
    expect(
      serviceSchema.parse({ name: "Service", repositoryUrls: [url] })
        .repositoryUrls,
    ).toEqual([url]);
    expect(
      serviceSchema.safeParse({ name: "Service", repositoryUrls: [url + "a"] })
        .success,
    ).toBe(false);
    const unicode = prefix + "é".repeat(20);
    expect(
      serviceSchema.parse({ name: "Service", repositoryUrls: [unicode] })
        .repositoryUrls,
    ).toEqual([new URL(unicode).toString()]);
  });
});
