import {
  DefinitionItem,
  DefinitionList,
  EmptyState,
  Section,
  Stack,
} from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { Text } from "@/components/ui/typography";
import type { getIntegrationPageData } from "../data";
import { IntegrationControl } from "./IntegrationControls";

type PageData = Awaited<ReturnType<typeof getIntegrationPageData>>;

function timestamp(value: Date | null) {
  return value ? value.toISOString() : "Never";
}

export function IntegrationList({
  data,
  configured,
}: {
  data: PageData;
  configured: boolean;
}) {
  const slug = data.workspace.slug;
  return (
    <Stack gap="lg">
      <Section title="GitHub App setup">
        <Text tone="muted" measure="readable">
          {configured
            ? "GitHub App configuration is present on this host. A host operator must bind an installation to this workspace before repositories can be connected."
            : "A host operator must configure a dedicated GitHub App and bind its installation to this workspace. Existing findings remain available while setup is incomplete."}
        </Text>
        <Text size="sm">
          The App needs Dependabot alerts read permission and access to the
          repositories you connect. See the project README for local host setup
          and the installation binding command.
        </Text>
        <TextLink
          href="https://github.com/jacksmith295/VulnVault/blob/main/README.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          Read host setup instructions
        </TextLink>
      </Section>
      {data.integrations.length === 0 && (
        <EmptyState
          title="No GitHub installation connected"
          description="Ask the host operator to bind the intended GitHub App installation to this workspace."
        />
      )}
      {data.integrations.map((integration) => (
        <Section
          key={integration.id}
          title={`GitHub: ${integration.accountLogin}`}
          description="This workspace connection controls every service mapped to this installation. Disabling it pauses sync for all those services and retains imported findings."
        >
          <DefinitionList>
            <DefinitionItem label="Account">
              {integration.accountLogin} ({integration.accountType})
            </DefinitionItem>
            <DefinitionItem label="Installation">
              {integration.installationId}
            </DefinitionItem>
            <DefinitionItem label="Connection">
              {integration.enabled ? "Enabled" : "Disabled"}
            </DefinitionItem>
            {integration.blockedUntil && (
              <DefinitionItem label="GitHub retry after">
                {timestamp(integration.blockedUntil)}
              </DefinitionItem>
            )}
          </DefinitionList>
          <IntegrationControl
            slug={slug}
            id={integration.id}
            version={integration.version}
            enabled={integration.enabled}
            kind="integration"
          />
        </Section>
      ))}
    </Stack>
  );
}
