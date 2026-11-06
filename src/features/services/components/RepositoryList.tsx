import { ItemList, ListItem } from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { Text } from "@/components/ui/typography";

type Repository = { id: string; url: string };

export function RepositoryList({
  repositories,
}: {
  repositories: Repository[];
}) {
  if (!repositories.length)
    return <Text tone="muted">No repositories added.</Text>;
  return (
    <ItemList density="compact">
      {repositories.map((repository) => (
        <ListItem density="compact" key={repository.id}>
          <TextLink
            href={repository.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {repository.url}
          </TextLink>
        </ListItem>
      ))}
    </ItemList>
  );
}
