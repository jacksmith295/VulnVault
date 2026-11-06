import { Inline } from "@/components/layout";
import { Badge, SeverityBadge, type SeverityTone } from "@/components/ui/badge";
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
      <SeverityBadge severity={severity as SeverityTone}>
        {severityLabels[severity as keyof typeof severityLabels]}
      </SeverityBadge>
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
