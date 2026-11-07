import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const more = vi.hoisted(() => vi.fn());
vi.mock("@/features/findings/service-list-data", () => ({
  getMoreServiceFindings: more,
}));
import { GET } from "@/app/(authenticated)/w/[workspaceSlug]/services/[serviceId]/findings/more/route";

const params = Promise.resolve({
  workspaceSlug: "workspace",
  serviceId: "service",
});
describe("service findings pagination route", () => {
  it("passes finding filters and fixed service scope through and disables response caching", async () => {
    more.mockResolvedValueOnce({
      reset: false,
      scopeKey: "scope",
      total: 0,
      findings: [],
      nextCursor: null,
    });
    const response = await GET(
      new NextRequest(
        "http://localhost/w/workspace/services/service/findings/more?q=package&source=github_dependabot&upstream=fixed&cursor=anchor&scope=scope",
      ),
      { params },
    );
    expect(more).toHaveBeenLastCalledWith(
      "workspace",
      "service",
      { q: "package", source: "github_dependabot", upstream: "fixed" },
      "anchor",
      "scope",
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await response.json()).reset).toBe(false);
  });
  it("preserves unknown and repeated filter values including empty duplicates for strict validation", async () => {
    more.mockResolvedValue({ reset: true });
    await GET(
      new NextRequest(
        "http://localhost/more?q=&q=&unknown=&column=new&cursor=a&scope=s",
      ),
      { params },
    );
    expect(more).toHaveBeenLastCalledWith(
      "workspace",
      "service",
      { q: ["", ""], unknown: "", column: "new" },
      "a",
      "s",
    );
  });
  it("rejects duplicated pagination parameters by passing no usable cursor or scope", async () => {
    more.mockResolvedValue({ reset: true });
    for (const query of [
      "cursor=a&cursor=a&scope=s",
      "cursor=&cursor=&scope=s",
      "cursor=a&scope=s&scope=s",
    ]) {
      const response = await GET(
        new NextRequest(`http://localhost/more?${query}`),
        { params },
      );
      const call = more.mock.calls.at(-1)!;
      expect(call[3] === undefined || call[4] === undefined).toBe(true);
      expect(await response.json()).toEqual({ reset: true });
    }
  });
});
