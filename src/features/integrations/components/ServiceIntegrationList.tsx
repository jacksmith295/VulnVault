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
import { Badge } from "@/components/ui/badge";
import { TextLink } from "@/components/ui/link";
import { Heading, Text } from "@/components/ui/typography";
import type { getServiceIntegrationPageData } from "../data";
import { parseGithubRepositoryUrl } from "../repository-url";
import {
  ConnectRepositoryForm,
  IntegrationControl,
} from "./IntegrationControls";

type PageData = Awaited<ReturnType<typeof getServiceIntegrationPageData>>;

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

export function ServiceIntegrationList({
  data,
  configured,
}: {
  data: PageData;
  configured: boolean;
}) {
  const slug = data.workspace.slug;
  const serviceId = data.service.id;
  const archived = data.service.archivedAt !== null;
  const githubRepositories = data.repositories.filter((repository) =>
    parseGithubRepositoryUrl(repository.url),
  );
  const connectedLinks = new Set(
    data.integrations.flatMap((integration) =>
      integration.repositories.map((repository) => repository.repositoryLinkId),
    ),
  );
  const available = githubRepositories.filter(
    (repository) => !connectedLinks.has(repository.id),
  );
  return (
    <Stack gap="lg">
      <Section
        title="GitHub"
        description="Import Dependabot alerts as findings for this service. Later syncs update source information and preserve local edits."
      >
        {githubRepositories.length > 0 && (
          <Badge tone="success">Recommended</Badge>
        )}
        <Text tone="muted" measure="readable">
          {githubRepositories.length > 0
            ? "Recommended because this service has a GitHub repository URL. This does not verify the App configuration, credentials, or repository access."
            : "Add a GitHub repository URL to this service to connect Dependabot. GitHub is the supported integration; other repository URLs can remain linked to the service."}
        </Text>
        <TextLink href={`/w/${slug}/integrations`}>
          Manage workspace connections
        </TextLink>
        <Text size="sm" tone="muted">
          Workspace connections manage GitHub App installations and enable or
          disable sync across all mapped services.
        </Text>
        {!configured && (
          <Text>
            Configure the GitHub App on this host before connecting or syncing
            repositories. Configuration presence does not verify credentials or
            access.
          </Text>
        )}
        {archived && (
          <Text>
            Restore this service before connecting repositories or syncing.
            Existing repository connections can still be enabled or disabled.
          </Text>
        )}
        {data.repositories.length === 0 && (
          <TextLink
            href={`/w/${slug}/services/${serviceId}${archived ? "" : "/edit"}`}
          >
            {archived
              ? "Return to service to restore it"
              : "Add service repository URLs"}
          </TextLink>
        )}
      </Section>
      {data.integrations.length === 0 && (
        <EmptyState
          title="No GitHub installation connected"
          description="Use workspace connections to review host setup and ask the host operator to bind the intended GitHub App installation."
        />
      )}
      {data.integrations
        .filter(
          (integration) =>
            (!archived && githubRepositories.length > 0) ||
            integration.repositories.length > 0,
        )
        .map((integration) => (
          <Section
            key={integration.id}
            title={`GitHub: ${integration.accountLogin}`}
          >
            <DefinitionList>
              <DefinitionItem label="Workspace connection">
                {integration.enabled ? "Enabled" : "Disabled"}
              </DefinitionItem>
              <DefinitionItem label="GitHub App">
                {!configured
                  ? "Host configuration is incomplete"
                  : integration.currentApp
                    ? "Matches this host's GitHub App"
                    : "Configured for another GitHub App"}
              </DefinitionItem>
              {integration.blockedUntil && (
                <DefinitionItem label="GitHub retry after">
                  {timestamp(integration.blockedUntil)}
                </DefinitionItem>
              )}
            </DefinitionList>
            {configured && !integration.currentApp && (
              <Text tone="muted">
                This installation is configured for another GitHub App. Its
                existing repository status is retained. It cannot connect or
                sync with the current App on this host.
              </Text>
            )}
            {!integration.enabled && (
              <Text tone="muted">
                Enable this installation in workspace connections before
                connecting or syncing repositories.
              </Text>
            )}
            {integration.repositories.length > 0 ? (
              <ItemList density="compact">
                {integration.repositories.map((repository) => (
                  <ListItem
                    key={`${serviceId}:${integration.id}:${repository.id}`}
                    density="compact"
                  >
                    <Stack>
                      <Heading level={3}>{repository.fullName}</Heading>
                      <Text size="sm" tone="muted">
                        {repository.repositoryUrl}
                      </Text>
                      <DefinitionList>
                        <DefinitionItem label="Repository">
                          {repository.enabled ? "Enabled" : "Disabled"}
                          {archived ? "; service archived" : ""}
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
                          serviceId={serviceId}
                          id={repository.id}
                          version={repository.version}
                          enabled={repository.enabled}
                          kind="repository"
                        />
                        <IntegrationControl
                          slug={slug}
                          serviceId={serviceId}
                          id={repository.id}
                          version={repository.version}
                          enabled={repository.enabled}
                          kind="sync"
                          disabled={
                            !configured ||
                            !integration.currentApp ||
                            !integration.enabled ||
                            !repository.enabled ||
                            archived
                          }
                        />
                      </Inline>
                    </Stack>
                  </ListItem>
                ))}
              </ItemList>
            ) : (
              <Text tone="muted">
                No repositories from this service are connected to this
                installation.
              </Text>
            )}
            {configured &&
              integration.currentApp &&
              integration.enabled &&
              !archived &&
              githubRepositories.length > 0 && (
                <ConnectRepositoryForm
                  key={`${slug}:${serviceId}:${integration.id}`}
                  slug={slug}
                  serviceId={serviceId}
                  integrationId={integration.id}
                  repositories={available}
                />
              )}
            {!archived &&
              available.length === 0 &&
              githubRepositories.length > 0 && (
                <Text tone="muted">
                  All GitHub repository links for this service are already
                  connected.
                </Text>
              )}
          </Section>
        ))}
    </Stack>
  );
}
