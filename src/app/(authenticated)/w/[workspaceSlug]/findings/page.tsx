import { Page, PageHeader } from "@/components/layout";
import { FormMessage } from "@/components/ui/form-message";
import { TextLink } from "@/components/ui/link";
import { getFindingBoard } from "@/features/findings/board-data";
import { FindingBoard } from "@/features/findings/components/FindingBoard";
import { FindingBoardFilters } from "@/features/findings/components/FindingBoardFilters";

export default async function WorkspaceFindingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspaceSlug } = await params;
  const query = await searchParams;
  const board = await getFindingBoard(workspaceSlug, query);
  return (
    <Page width="wide">
      <PageHeader
        title="Findings"
        description={`Track findings across ${board.workspace.name}.`}
        back={
          <TextLink href={`/w/${workspaceSlug}`}>Back to services</TextLink>
        }
      />
      <FindingBoardFilters
        key={JSON.stringify(query)}
        slug={workspaceSlug}
        filters={board.filters}
        groups={board.groups}
        services={board.services}
      />
      {board.filterError ? (
        <FormMessage>{board.filterError}</FormMessage>
      ) : (
        <FindingBoard
          key={board.scopeKey}
          revisionKey={board.revisionKey}
          slug={workspaceSlug}
          filters={board.filters}
          initialColumns={board.columns}
          scopeKey={board.scopeKey}
        />
      )}
    </Page>
  );
}
