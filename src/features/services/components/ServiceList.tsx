import { EmptyState, ItemList, ListItem, Stack } from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { Text } from "@/components/ui/typography";
import type { Service } from "../data";

export function ServiceList({
  slug,
  services,
  archived,
}: {
  slug: string;
  services: Service[];
  archived: boolean;
}) {
  if (!services.length)
    return (
      <EmptyState
        title={archived ? "No archived services" : "No services yet"}
        description={
          archived
            ? "Archived services will appear here."
            : "Add a service to start tracking its repositories."
        }
      />
    );
  return (
    <ItemList>
      {services.map((service) => (
        <ListItem key={service.id}>
          <Stack gap="sm">
            <TextLink href={`/w/${slug}/services/${service.id}`}>
              {service.name}
            </TextLink>
            {service.description && (
              <Text size="sm" tone="muted" preserveWhitespace>
                {service.description}
              </Text>
            )}
          </Stack>
        </ListItem>
      ))}
    </ItemList>
  );
}
