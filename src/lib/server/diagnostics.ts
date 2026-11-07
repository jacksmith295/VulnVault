import "server-only";

const operations = [
  "service.create", "service.edit", "service.archive", "service.access",
  "group.create", "group.edit",
  "finding.create", "finding.edit", "finding.status",
  "workspace.limiter", "workspace.create",
  "integration.toggle", "integration.repository-toggle", "integration.connect",
  "integration.bind", "integration.claim",
] as const;

type DatabaseOperation = (typeof operations)[number];
type FailureCategory = "connection" | "constraint" | "transaction" | "cancelled" | "resource" | "unknown";

function categoryForCode(code: unknown): FailureCategory {
  switch (code) {
    case "08000": case "08001": case "08003": case "08004":
    case "08006": case "08007": case "08P01": case "57P01":
    case "57P02": case "57P03": case "ECONNREFUSED": case "ECONNRESET":
    case "ETIMEDOUT": case "ENOTFOUND": case "EAI_AGAIN": case "EPIPE":
      return "connection";
    case "23502": case "23503": case "23505": case "23514": case "23P01":
      return "constraint";
    case "40001": case "40P01":
      return "transaction";
    case "57014":
      return "cancelled";
    case "53000": case "53100": case "53200": case "53300": case "53400":
      return "resource";
    default:
      return "unknown";
  }
}

function failureCategory(error: unknown): FailureCategory {
  const seen = new Set<object>();
  // Drizzle wraps driver errors in cause. Bound traversal and never invoke getters.
  for (let depth = 0; depth < 8; depth++) {
    if (typeof error !== "object" || error === null || seen.has(error)) break;
    seen.add(error);
    const code = Object.getOwnPropertyDescriptor(error, "code");
    const category = categoryForCode(code && "value" in code ? code.value : undefined);
    if (category !== "unknown") return category;
    const cause = Object.getOwnPropertyDescriptor(error, "cause");
    error = cause && "value" in cause ? cause.value : undefined;
  }
  return "unknown";
}

/** Emit only generated fields. Diagnostics must never change the caller's result. */
export function reportDatabaseFailure(operation: DatabaseOperation, error: unknown): void {
  try {
    if (!operations.includes(operation)) return;
    let category: FailureCategory = "unknown";
    try {
      category = failureCategory(error);
    } catch {
      // Proxies can throw even during descriptor inspection. Treat them as unknown.
    }
    console.error("[VulnVault] operation failed", { operation, category });
  } catch {
    // A failing console sink must not mask the existing safe form result.
  }
}
