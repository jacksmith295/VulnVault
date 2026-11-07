import { ItemList, ListItem, Stack } from "@/components/layout";
import { LoadingRegion } from "@/components/layout/loading";
import { Skeleton } from "@/components/ui/skeleton";

export function FindingsListSkeleton() {
  return (
    <LoadingRegion label="Loading service findings">
      <Stack>
        <Skeleton size="label" />
        <ItemList density="compact">
          {Array.from({ length: 6 }, (_, index) => (
            <ListItem density="compact" key={index}>
              <Stack gap="sm">
                <Skeleton />
                <Skeleton size="label" />
              </Stack>
            </ListItem>
          ))}
        </ItemList>
      </Stack>
    </LoadingRegion>
  );
}
