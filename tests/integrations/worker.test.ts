import { describe, expect, it, vi } from "vitest";
import { runIntegrationWorker } from "@/features/integrations/worker";
import type { SyncResult } from "@/features/integrations/sync";

function setup() {
  const stop = new AbortController();
  return {
    stop,
    signal: stop.signal,
    runNextSync: vi.fn<() => Promise<SyncResult | null>>(),
    log: vi.fn(),
    logError: vi.fn(),
    wait: vi.fn(async () => {}),
  };
}

describe("integration worker polling", () => {
  it("retries unexpected polling or failure-recording errors and recovers", async () => {
    const options = setup();
    options.runNextSync
      .mockRejectedValueOnce(new Error("sensitive provider or database details"))
      .mockResolvedValueOnce({ status: "success", imported: 3 })
      .mockImplementationOnce(async () => {
        options.stop.abort();
        return null;
      });
    expect(await runIntegrationWorker(options)).toBe(0);
    expect(options.runNextSync).toHaveBeenCalledTimes(3);
    expect(options.wait).toHaveBeenCalledExactlyOnceWith(10_000, options.signal);
    expect(options.log).toHaveBeenCalledExactlyOnceWith(
      "Repository sync: success; imported 3.",
    );
    expect(options.logError).toHaveBeenCalledTimes(1);
    expect(options.logError.mock.calls.flat().join()).not.toContain("sensitive");
  });

  it("waits after structured failure and idle polls before trying again", async () => {
    const options = setup();
    options.runNextSync
      .mockResolvedValueOnce({ status: "failed", error: "private details" })
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(async () => {
        options.stop.abort();
        return null;
      });
    expect(await runIntegrationWorker(options)).toBe(0);
    expect(options.wait.mock.calls).toEqual([
      [10_000, options.signal],
      [10_000, options.signal],
    ]);
    expect(options.log).toHaveBeenCalledExactlyOnceWith(
      "Repository sync: failed; imported 0.",
    );
  });

  it("drains successive successful one-shot syncs until idle", async () => {
    const options = setup();
    options.runNextSync
      .mockResolvedValueOnce({ status: "success", imported: 1 })
      .mockResolvedValueOnce({ status: "success", imported: 0 })
      .mockResolvedValueOnce(null);
    expect(await runIntegrationWorker({ ...options, once: true, workspace: "test" })).toBe(0);
    expect(options.runNextSync).toHaveBeenCalledTimes(3);
    expect(options.runNextSync).toHaveBeenCalledWith("test");
    expect(options.wait).not.toHaveBeenCalled();
  });

  it.each(["structured", "exception"])("stops one-shot draining with a nonzero result on %s failure", async (failure) => {
    const options = setup();
    options.runNextSync.mockResolvedValueOnce({ status: "success" });
    if (failure === "structured") options.runNextSync.mockResolvedValueOnce({ status: "failed" });
    else options.runNextSync.mockRejectedValueOnce(new Error("database unavailable"));
    expect(await runIntegrationWorker({ ...options, once: true })).toBe(1);
    expect(options.runNextSync).toHaveBeenCalledTimes(2);
    expect(options.wait).not.toHaveBeenCalled();
    if (failure === "exception") {
      expect(options.logError).toHaveBeenCalledExactlyOnceWith(
        "Integration worker polling failed. Check PostgreSQL and workspace sync status.",
      );
    }
  });

  it("does no work when already aborted", async () => {
    const options = setup();
    options.stop.abort();
    expect(await runIntegrationWorker(options)).toBe(0);
    expect(options.runNextSync).not.toHaveBeenCalled();
    expect(options.wait).not.toHaveBeenCalled();
    expect(options.logError).not.toHaveBeenCalled();
  });

  it("ends quietly during the abortable delay without another poll", async () => {
    const options = setup();
    options.runNextSync.mockResolvedValue(null);
    const pending = runIntegrationWorker({ ...options, wait: undefined });
    // Allow the idle poll to enter the real ten-second abortable timer.
    await new Promise<void>((resolve) => setImmediate(resolve));
    options.stop.abort();
    expect(await pending).toBe(0);
    expect(options.runNextSync).toHaveBeenCalledTimes(1);
    expect(options.logError).not.toHaveBeenCalled();
  });
});
