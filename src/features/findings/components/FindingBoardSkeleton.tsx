import { FormActions, FormLayout, Stack } from "@/components/layout";
import { FilterGrid, StatusBoard } from "@/components/layout/board";
import { LoadingRegion } from "@/components/layout/loading";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { statuses, statusLabels } from "../validation";

export function FindingBoardSkeleton({
  initialStatus = "new",
}: {
  initialStatus?: string;
}) {
  return (
    <LoadingRegion label="Loading findings">
      <FormLayout tone="surface">
        <FilterGrid>
          {Array.from({ length: 5 }, (_, index) => (
            <Stack gap="sm" key={index}>
              <Skeleton size="label" />
              <Skeleton size="control" />
            </Stack>
          ))}
        </FilterGrid>
        <FormActions>
          <Skeleton size="control" />
        </FormActions>
      </FormLayout>
      <StatusBoard
        initialStatus={initialStatus}
        columns={statuses.map((status) => ({
          status,
          label: statusLabels[status],
          regionLabel: `${statusLabels[status]} findings`,
          content: (
            <Stack>
              {[0, 1].map((index) => (
                <Card size="sm" key={index}>
                  <CardContent>
                    <Stack>
                      <Skeleton />
                      <Skeleton />
                      <Skeleton size="label" />
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          ),
        }))}
      />
    </LoadingRegion>
  );
}
