import {
  DefinitionItem,
  DefinitionList,
  Section,
  Stack,
} from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { Text } from "@/components/ui/typography";
import type { findingSource } from "@/db/schema";

type Source = typeof findingSource.$inferSelect;
const states: Record<string, string> = {
  open: "Open",
  fixed: "Fixed",
  dismissed: "Dismissed",
  auto_dismissed: "Automatically dismissed",
};

export function FindingSourceInfo({ source }: { source: Source }) {
  return (
    <Section
      title="Dependabot source"
      description="Upstream state is separate from this finding's local status. Sync preserves local edits and does not automatically resolve or reopen findings."
    >
      <Stack>
        <Text>{source.summary}</Text>
        <DefinitionList>
          <DefinitionItem label="Upstream state">
            {states[source.state] ?? "Unknown"}
          </DefinitionItem>
          <DefinitionItem label="Upstream severity">
            {source.severity}
          </DefinitionItem>
          <DefinitionItem label="Package">
            {source.packageName} ({source.ecosystem})
          </DefinitionItem>
          <DefinitionItem label="Manifest">
            {source.manifestPath}
          </DefinitionItem>
          <DefinitionItem label="GHSA">{source.ghsaId}</DefinitionItem>
          <DefinitionItem label="CVE">
            {source.cveId ?? "Not provided"}
          </DefinitionItem>
          <DefinitionItem label="Vulnerable versions">
            {source.vulnerableRange}
          </DefinitionItem>
          <DefinitionItem label="First patched version">
            {source.patchedVersion ?? "Not provided"}
          </DefinitionItem>
          <DefinitionItem label="Upstream created">
            {source.upstreamCreatedAt.toISOString()}
          </DefinitionItem>
          <DefinitionItem label="Upstream updated">
            {source.upstreamUpdatedAt.toISOString()}
          </DefinitionItem>
          <DefinitionItem label="Last seen in sync">
            {source.lastSeenAt.toISOString()}
          </DefinitionItem>
          <DefinitionItem label="Alert number">
            {source.alertNumber}
          </DefinitionItem>
        </DefinitionList>
        <TextLink href={source.url} target="_blank" rel="noopener noreferrer">
          View Dependabot alert on GitHub
        </TextLink>
      </Stack>
    </Section>
  );
}
