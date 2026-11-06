import "server-only";
import { setTimeout } from "node:timers/promises";
import type { SyncResult } from "./sync";

type WorkerOptions = {
  runNextSync: (workspace?: string) => Promise<SyncResult | null>;
  signal: AbortSignal;
  once?: boolean;
  workspace?: string;
  log?: (message: string) => void;
  logError?: (message: string) => void;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};

export async function runIntegrationWorker({
  runNextSync,
  signal,
  once = false,
  workspace,
  log = console.log,
  logError = console.error,
  wait = async (milliseconds, signal) => {
    await setTimeout(milliseconds, undefined, { signal });
  },
}: WorkerOptions): Promise<0 | 1> {
  while (!signal.aborted) {
    let failed = false;
    try {
      const result = await runNextSync(workspace);
      if (signal.aborted) return 0;
      if (result) {
        // Log only status and counts, never provider errors or vulnerability evidence.
        log(
          `Repository sync: ${result.status}; imported ${result.imported ?? 0}.`,
        );
        if (result.status === "success") continue;
        failed = true;
      } else if (once) {
        return 0;
      }
    } catch {
      if (signal.aborted) return 0;
      logError(
        once
          ? "Integration worker polling failed. Check PostgreSQL and workspace sync status."
          : "Integration worker polling failed. Check PostgreSQL and workspace sync status; polling will retry.",
      );
      failed = true;
    }
    if (once) return failed ? 1 : 0;
    try {
      await wait(10_000, signal);
    } catch (error) {
      if (signal.aborted) return 0;
      throw error;
    }
  }
  return 0;
}
