import { afterEach, describe, expect, it, vi } from "vitest";
import { reportDatabaseFailure } from "@/lib/server/diagnostics";

afterEach(() => vi.restoreAllMocks());

describe("safe database diagnostics", () => {
  const operation = "service.create";
  function sink() {
    return vi.spyOn(console, "error").mockImplementation(() => {});
  }

  it.each([
    ["23505", "constraint"], ["23503", "constraint"],
    ["40001", "transaction"], ["40P01", "transaction"],
    ["ECONNREFUSED", "connection"], ["08006", "connection"],
    ["57014", "cancelled"], ["53300", "resource"],
    ["arbitrary-secret-code", "unknown"],
  ])("classifies nested driver code %s without emitting the error", (code, category) => {
    const log = sink();
    const privateError = Object.assign(new Error("private password and evidence"), {
      cause: { cause: { code, query: "secret SQL", detail: "private detail", constraint: "tenant-id" } },
      url: "postgresql://private:password@example.com/db",
      toJSON: () => { throw new Error("must not serialize errors"); },
    });
    reportDatabaseFailure(operation, privateError);
    // Exact argument comparison covers every console argument, including additional metadata.
    expect(log.mock.calls).toEqual([["[VulnVault] operation failed", { operation, category }]]);
  });

  it("does not invoke code, cause or inherited getters", () => {
    const log = sink();
    const getter = vi.fn(() => { throw new Error("sensitive getter"); });
    const error = Object.create({ code: "23505", cause: { code: "ECONNREFUSED" } });
    Object.defineProperties(error, { code: { get: getter }, cause: { get: getter } });
    reportDatabaseFailure(operation, error);
    expect(getter).not.toHaveBeenCalled();
    expect(log.mock.calls).toEqual([["[VulnVault] operation failed", { operation, category: "unknown" }]]);
  });

  it("ignores inherited codes and causes", () => {
    const log = sink();
    reportDatabaseFailure(operation, Object.create({ code: "23505", cause: { code: "ECONNREFUSED" } }));
    expect(log.mock.calls).toEqual([["[VulnVault] operation failed", { operation, category: "unknown" }]]);
  });

  it("bounds cycles and deeply nested causes", () => {
    const log = sink();
    const cycle: { cause?: unknown } = {};
    cycle.cause = cycle;
    reportDatabaseFailure(operation, cycle);
    let deep: unknown = { code: "23505" };
    for (let i = 0; i < 8; i++) deep = { cause: deep };
    reportDatabaseFailure(operation, deep);
    expect(log.mock.calls).toEqual(Array.from({ length: 2 }, () => ["[VulnVault] operation failed", { operation, category: "unknown" }]));
  });

  it.each([undefined, null, "private string", 123, Symbol("secret"), { code: { toString: () => "23505" } }])("handles unknown error %s", (error) => {
    const log = sink();
    reportDatabaseFailure(operation, error);
    expect(log.mock.calls).toEqual([["[VulnVault] operation failed", { operation, category: "unknown" }]]);
  });

  it("handles throwing and revoked proxies", () => {
    const log = sink();
    const error = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("secret proxy"); } });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expect(() => reportDatabaseFailure(operation, error)).not.toThrow();
    expect(() => reportDatabaseFailure(operation, revoked.proxy)).not.toThrow();
    expect(log.mock.calls).toEqual(Array.from({ length: 2 }, () => ["[VulnVault] operation failed", { operation, category: "unknown" }]));
  });

  it("rejects operation names outside the runtime allowlist without inspecting them", () => {
    const log = sink();
    const value = new Proxy({}, { get() { throw new Error("secret"); } });
    for (const invalid of ["private-workspace-id", "toString", null, value]) {
      // Exercise callers that bypass TypeScript without weakening the public API.
      // @ts-expect-error The public API accepts only fixed operation names.
      expect(() => reportDatabaseFailure(invalid, { code: "23505" })).not.toThrow();
    }
    expect(log).not.toHaveBeenCalled();
  });

  it("does not throw when the console sink fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => { throw new Error("sink unavailable"); });
    expect(() => reportDatabaseFailure(operation, { code: "23505" })).not.toThrow();
  });
});
