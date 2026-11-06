import {
  DefinitionItem,
  DefinitionList,
  EmptyState,
  Inline,
  ItemList,
  ListItem,
  Section,
  Stack,
} from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { Heading, Text } from "@/components/ui/typography";
import type { getIntegrationPageData } from "../data";
import {
  ConnectRepositoryForm,
  IntegrationControl,
} from "./IntegrationControls";

type PageData = Awaited<ReturnType<typeof getIntegrationPageData>>;

const failures: Record<string, string> = {
  not_configured: "Configure the GitHub App on this host before syncing.",
  rate_limited:
    "GitHub has temporarily limited requests. Sync will retry later.",
  invalid_response:
    "GitHub returned an unsupported response. No alerts were imported.",
  response_limit:
    "This repository exceeds the supported sync limits. No alerts were imported.",
  configuration: "The host GitHub App configuration needs attention.",
  unavailable: "Repository access or Dependabot alerts are unavailable.",
  network: "GitHub could not be reached.",
  internal:
    "Sync could not complete. Check host configuration and retry later.",
};

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
  const connectedLinks = new Set(
    data.integrations.flatMap((integration) =>
      integration.repositories.map((repository) => repository.repositoryLinkId),
    ),
  );
  const available = data.repositories.filter(
    (repository) => !connectedLinks.has(repository.id),
  );
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
          description="Dependabot alerts are imported as findings. Later syncs update source information and preserve your local edits."
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
          {integration.repositories.length > 0 ? (
            <ItemList density="compact">
              {integration.repositories.map((repository) => (
                <ListItem key={repository.id} density="compact">
                  <Stack>
                    <Heading level={3}>{repository.fullName}</Heading>
                    <TextLink
                      href={`/w/${slug}/services/${repository.serviceId}`}
                    >
                      {repository.serviceName}
                    </TextLink>
                    <DefinitionList>
                      <DefinitionItem label="Repository">
                        {repository.enabled ? "Enabled" : "Disabled"}
                        {repository.archivedAt ? "; service archived" : ""}
                      </DefinitionItem>
                      <DefinitionItem label="Last attempt">
                        {timestamp(repository.lastAttemptAt)}
                      </DefinitionItem>
                      <DefinitionItem label="Last successful sync">
                        {timestamp(repository.lastSuccessAt)}
                      </DefinitionItem>
                      <DefinitionItem label="Next attempt">
                        {timestamp(repository.nextAttemptAt)}
                      </DefinitionItem>
                      <DefinitionItem label="Sync status">
                        {repository.leaseExpiresAt &&
                        repository.leaseExpiresAt > new Date()
                          ? "Sync in progress."
                          : repository.errorCode
                            ? (failures[repository.errorCode] ??
                              "Sync failed. The host operator can check connection and repository configuration.")
                            : repository.lastSuccessAt
                              ? "Last sync succeeded."
                              : "Waiting for the first sync."}
                      </DefinitionItem>
                    </DefinitionList>
                    <Inline>
                      <IntegrationControl
                        slug={slug}
                        id={repository.id}
                        version={repository.version}
                        enabled={repository.enabled}
                        kind="repository"
                      />
                      <IntegrationControl
                        slug={slug}
                        id={repository.id}
                        version={repository.version}
                        enabled={repository.enabled}
                        kind="sync"
                        disabled={
                          !configured ||
                          !integration.enabled ||
                          !repository.enabled ||
                          repository.archivedAt !== null
                        }
                      />
                    </Inline>
                  </Stack>
                </ListItem>
              ))}
            </ItemList>
          ) : (
            <Text tone="muted">
              No repositories connected to this installation.
            </Text>
          )}
          {available.length > 0 && configured && integration.enabled ? (
            <ConnectRepositoryForm
              slug={slug}
              integrationId={integration.id}
              repositories={available}
            />
          ) : (
            <Text tone="muted">
              {!configured
                ? "Complete host configuration to connect repositories."
                : !integration.enabled
                  ? "Enable this connection to connect repositories."
                  : "Add a GitHub repository URL to an active service to connect another repository."}
            </Text>
          )}
        </Section>
      ))}
    </Stack>
  );
}
