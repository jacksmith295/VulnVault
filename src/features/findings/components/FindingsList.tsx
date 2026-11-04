import {
  EmptyState,
  ItemList,
  ListItem,
  Section,
  Stack,
} from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { Text } from "@/components/ui/typography";
import type { Finding } from "../data";
import { FindingBadges } from "./FindingBadges";
export function FindingsList({
  slug,
  serviceId,
  findings,
  archived,
}: {
  slug: string;
  serviceId: string;
  findings: Finding[];
  archived: boolean;
}) {
  const base = `/w/${slug}/services/${serviceId}/findings`;
  return (
    <Section title="Findings">
      <Stack>
        {!archived && <TextLink href={`${base}/new`}>Create finding</TextLink>}
        {archived && (
          <Text tone="muted">
            Restore this service before creating or editing findings.
          </Text>
        )}
        {!findings.length ? (
          <EmptyState
            title="No findings yet"
            description="Track vulnerabilities affecting this service."
          />
        ) : (
          <ItemList>
            {findings.map((finding) => (
              <ListItem key={finding.id}>
                <Stack gap="sm">
                  <TextLink href={`${base}/${finding.id}`}>
                    {finding.title}
                  </TextLink>
                  <FindingBadges
                    severity={finding.severity}
                    status={finding.status}
                  />
                  <Text size="sm" tone="muted">
                    Created {finding.createdAt.toISOString()}
                  </Text>
                </Stack>
              </ListItem>
            ))}
          </ItemList>
        )}
      </Stack>
    </Section>
  );
}
