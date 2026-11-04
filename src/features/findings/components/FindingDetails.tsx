import {
  DefinitionItem,
  DefinitionList,
  ItemList,
  ListItem,
  Section,
  Stack,
} from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { Text } from "@/components/ui/typography";
import type { Finding } from "../data";
import { FindingBadges } from "./FindingBadges";
export function FindingDetails({
  slug,
  serviceId,
  finding,
  references,
  archived,
}: {
  slug: string;
  serviceId: string;
  finding: Finding;
  references: { id: string; url: string }[];
  archived: boolean;
}) {
  return (
    <Stack gap="lg">
      <FindingBadges severity={finding.severity} status={finding.status} />
      {archived ? (
        <Text tone="muted">
          Restore this service before creating or editing findings.
        </Text>
      ) : (
        <TextLink
          href={`/w/${slug}/services/${serviceId}/findings/${finding.id}/edit`}
        >
          Edit finding
        </TextLink>
      )}
      <Section title="Description">
        <Text preserveWhitespace>{finding.description}</Text>
      </Section>
      <Section title="Remediation notes">
        <Text preserveWhitespace>
          {finding.remediationNotes || "No remediation notes provided."}
        </Text>
      </Section>
      <Section title="Reference URLs">
        {references.length ? (
          <ItemList>
            {references.map((reference) => (
              <ListItem key={reference.id}>
                <TextLink
                  href={reference.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {reference.url}
                </TextLink>
              </ListItem>
            ))}
          </ItemList>
        ) : (
          <Text tone="muted">No reference URLs provided.</Text>
        )}
      </Section>
      <DefinitionList>
        <DefinitionItem label="Created">
          {finding.createdAt.toISOString()}
        </DefinitionItem>
        <DefinitionItem label="Updated">
          {finding.updatedAt.toISOString()}
        </DefinitionItem>
        {finding.resolvedAt && (
          <DefinitionItem label="Resolved">
            {finding.resolvedAt.toISOString()}
          </DefinitionItem>
        )}
      </DefinitionList>
    </Stack>
  );
}
