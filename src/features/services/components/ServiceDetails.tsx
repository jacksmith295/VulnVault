import { Section, Stack } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { TextLink } from "@/components/ui/link";
import { Text } from "@/components/ui/typography";
import type { Service } from "../data";
import { ArchiveServiceForm } from "./ArchiveServiceForm";
import { RepositoryList } from "./RepositoryList";

export function ServiceDetails({
  slug,
  service,
  repositories,
  manage,
}: {
  slug: string;
  service: Service;
  repositories: { id: string; url: string }[];
  manage: boolean;
}) {
  const archived = service.archivedAt !== null;
  return (
    <Stack gap="lg">
      <Text size="sm" tone="muted">
        Status:{" "}
        <Badge tone={archived ? "muted" : "success"}>
          {archived ? "Archived" : "Active"}
        </Badge>
      </Text>
      <Section title="Description">
        <Text preserveWhitespace>
          {service.description || "No description provided."}
        </Text>
      </Section>
      <Section title="Repositories">
        <RepositoryList repositories={repositories} />
      </Section>
      <Text size="sm" tone="muted">
        Updated {service.updatedAt.toISOString()}
      </Text>
      {manage && (
        <Stack>
          <TextLink href={`/w/${slug}/services/${service.id}/access`}>
            Manage access
          </TextLink>
          {!archived && (
            <TextLink href={`/w/${slug}/services/${service.id}/edit`}>
              Edit service
            </TextLink>
          )}
          <ArchiveServiceForm
            slug={slug}
            id={service.id}
            version={service.version}
            archived={archived}
          />
        </Stack>
      )}
    </Stack>
  );
}
