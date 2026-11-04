import { Inline } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { severityLabels, statusLabels } from "../validation";
export function FindingBadges({
  severity,
  status,
}: {
  severity: string;
  status: string;
}) {
  return (
    <Inline>
      <Badge
        tone={
          severity === "critical" || severity === "high"
            ? "danger"
            : severity === "informational"
              ? "muted"
              : "default"
        }
      >
        {severityLabels[severity as keyof typeof severityLabels]}
      </Badge>
      <Badge
        tone={
          status === "resolved"
            ? "success"
            : status === "rejected" || status === "accepted_risk"
              ? "muted"
              : "default"
        }
      >
        {statusLabels[status as keyof typeof statusLabels]}
      </Badge>
    </Inline>
  );
}
