import { Suspense } from "react";
import { Inline, Page, PageHeader, Stack } from "@/components/layout";
import { BoardSpace } from "@/components/layout/board";
import { FormMessage } from "@/components/ui/form-message";
import { AppLink } from "@/components/ui/link";
import { parseBoardFilters } from "@/features/findings/board-validation";
import {
  getFindingBoard,
  getFindingBoardFilterOptions,
} from "@/features/findings/board-data";
import { FindingBoard } from "@/features/findings/components/FindingBoard";
import { FindingBoardFilters } from "@/features/findings/components/FindingBoardFilters";
import { FindingBoardSkeleton } from "@/features/findings/components/FindingBoardSkeleton";
import { requireWorkspace } from "@/features/workspaces/data";

type Query = Record<string, string | string[] | undefined>;

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<Query>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await requireWorkspace(workspaceSlug);
  const query = await searchParams;
  return (
    <Page width="wide" layout="board">
      <PageHeader
        title={workspace.name}
        description="Findings"
        actions={
          <Inline>
            <AppLink href={`/w/${workspace.slug}/services`}>Services</AppLink>
            {["owner", "admin"].includes(workspace.role) && (
              <>
                <AppLink href={`/w/${workspace.slug}/groups`}>Groups</AppLink>
                <AppLink href={`/w/${workspace.slug}/integrations`}>
                  Integrations
                </AppLink>
              </>
            )}
          </Inline>
        }
      />
      <Suspense
        key={workspaceSlug}
        fallback={
          <FindingBoardSkeleton
            initialStatus={parseBoardFilters(query).filters.status}
          />
        }
      >
        <BoardContent workspaceSlug={workspaceSlug} query={query} />
      </Suspense>
    </Page>
  );
}

async function BoardContent({
  workspaceSlug,
  query,
}: {
  workspaceSlug: string;
  query: Query;
}) {
  const options = await getFindingBoardFilterOptions(workspaceSlug, query);
  const navigationKey = JSON.stringify(Object.entries(query).sort());
  return (
    <Stack gap="lg" grow>
      <FindingBoardFilters
        slug={workspaceSlug}
        navigationKey={navigationKey}
        filters={options.filters}
        groups={options.groups}
        services={options.services}
      />
      <Suspense
        key={navigationKey}
        fallback={
          <FindingBoardSkeleton
            includeFilters={false}
            initialStatus={options.filters.status}
          />
        }
      >
        <BoardResults workspaceSlug={workspaceSlug} query={query} />
      </Suspense>
    </Stack>
  );
}

async function BoardResults({
  workspaceSlug,
  query,
}: {
  workspaceSlug: string;
  query: Query;
}) {
  const board = await getFindingBoard(workspaceSlug, query);
  return board.filterError ? (
    <BoardSpace>
      <FormMessage>{board.filterError}</FormMessage>
    </BoardSpace>
  ) : (
    <FindingBoard
      key={board.scopeKey}
      revisionKey={board.revisionKey}
      slug={workspaceSlug}
      filters={board.filters}
      initialColumns={board.columns}
      scopeKey={board.scopeKey}
    />
  );
}
