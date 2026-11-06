"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Inline, Stack } from "@/components/layout";
import { StatusBoard } from "@/components/layout/board";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { TextLink } from "@/components/ui/link";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import { Text } from "@/components/ui/typography";
import type {
  BoardFinding,
  MoreBoardFindings,
  getFindingBoard,
} from "../board-data";
import type { BoardFilters, FindingStatus } from "../board-validation";
import { changeBoardFindingStatusAction } from "../board-actions";
import { statuses, statusLabels } from "../validation";
import { FindingBadges } from "./FindingBadges";

type Columns = Awaited<ReturnType<typeof getFindingBoard>>["columns"];
type StatusFeedback = { error: string; conflict?: boolean } | undefined;
type BoardProps = {
  slug: string;
  filters: BoardFilters;
  initialColumns: Columns;
  scopeKey: string;
};
type FeedbackHandler = (feedback: StatusFeedback) => void;

export function FindingBoard({
  revisionKey,
  ...props
}: BoardProps & { revisionKey: string }) {
  const router = useRouter();
  // Server refreshes replace loaded pages, while action feedback survives the response.
  const [feedback, setFeedback] = useState<StatusFeedback>();
  return (
    <Stack grow>
      {feedback && <FormMessage>{feedback.error}</FormMessage>}
      {feedback?.conflict && (
        <Button
          variant="outline"
          onClick={() => {
            setFeedback(undefined);
            router.refresh();
          }}
        >
          Refresh board
        </Button>
      )}
      <FindingBoardCollection
        key={revisionKey}
        {...props}
        reportFeedback={setFeedback}
      />
    </Stack>
  );
}

function FindingBoardCard({
  slug,
  finding,
  reportFeedback,
}: {
  slug: string;
  finding: BoardFinding;
  reportFeedback: FeedbackHandler;
}) {
  const router = useRouter();
  const [version] = useState(finding.version);
  const [pending, startTransition] = useTransition();
  function changeStatus(status: FindingStatus) {
    reportFeedback(undefined);
    startTransition(async () => {
      try {
        const result = await changeBoardFindingStatusAction(
          slug,
          finding.serviceId,
          finding.id,
          version,
          status,
        );
        if (result.error !== undefined) {
          reportFeedback({
            error: `${finding.title}: ${result.error}`,
            conflict: result.conflict,
          });
        } else router.refresh();
      } catch {
        reportFeedback({
          error: `${finding.title}: Could not change this finding. Refresh the board and try again.`,
          conflict: true,
        });
      }
    });
  }
  return (
    <Card size="sm">
      <CardContent>
        <Stack gap="sm">
          <TextLink
            href={`/w/${slug}/services/${finding.serviceId}/findings/${finding.id}`}
          >
            {finding.title}
          </TextLink>
          <FindingBadges severity={finding.severity} status={finding.status} />
          <Text size="sm" tone="muted">
            {finding.serviceName}
          </Text>
          <Inline>
            {finding.archived && <Badge tone="muted">Archived service</Badge>}
            <Menu>
              <MenuTrigger
                disabled={finding.archived || pending}
                aria-label={`Change status for ${finding.title}`}
              >
                {pending ? "Updating…" : "Change status"}
              </MenuTrigger>
              <MenuPopup>
                {statuses.map((status) => (
                  <MenuItem
                    key={status}
                    disabled={status === finding.status || pending}
                    onClick={() => changeStatus(status)}
                  >
                    {statusLabels[status]}
                  </MenuItem>
                ))}
              </MenuPopup>
            </Menu>
          </Inline>
        </Stack>
      </CardContent>
    </Card>
  );
}

function FindingBoardCollection({
  slug,
  filters,
  initialColumns,
  scopeKey,
  reportFeedback,
}: BoardProps & { reportFeedback: FeedbackHandler }) {
  const router = useRouter();
  const [columns, setColumns] = useState(initialColumns);
  const [loading, setLoading] = useState<
    Partial<Record<FindingStatus, boolean>>
  >({});
  const [resetting, setResetting] = useState(false);
  const active = useRef(true);
  const requests = useRef(new Set<FindingStatus>());
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function loadMore(status: FindingStatus, cursor: string) {
    if (requests.current.has(status) || resetting) return;
    requests.current.add(status);
    setLoading((previous) => ({ ...previous, [status]: true }));
    try {
      const query = new URLSearchParams({
        ...filters,
        column: status,
        cursor,
        scope: scopeKey,
      });
      const response = await fetch(`/w/${slug}/findings/more?${query}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not load findings");
      const result = (await response.json()) as MoreBoardFindings;
      if (!active.current) return;
      if (result.reset) {
        active.current = false;
        setColumns([]);
        setResetting(true);
        router.refresh();
        return;
      }
      setColumns((previous) =>
        previous.map((column) =>
          column.status !== status
            ? column
            : {
                ...column,
                total: result.total,
                nextCursor: result.nextCursor,
                findings: [
                  ...new Map(
                    [...column.findings, ...result.findings].map((finding) => [
                      finding.id,
                      finding,
                    ]),
                  ).values(),
                ],
              },
        ),
      );
    } catch {
      if (active.current) {
        active.current = false;
        setColumns([]);
        setResetting(true);
        router.refresh();
      }
    } finally {
      requests.current.delete(status);
      if (active.current)
        setLoading((previous) => ({ ...previous, [status]: false }));
    }
  }
  if (resetting)
    return (
      <Stack>
        <FormMessage tone="info">
          Board data needs to be refreshed. Access or findings may have changed.
        </FormMessage>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Refresh board
        </Button>
      </Stack>
    );
  return (
    <StatusBoard
      initialStatus={filters.status ?? "new"}
      columns={columns.map((column) => ({
        status: column.status,
        label: `${statusLabels[column.status]} (${column.total})`,
        regionLabel: `${statusLabels[column.status]} findings`,
        content: (
          <Stack>
            {column.findings.map((finding) => (
              <FindingBoardCard
                key={finding.id}
                slug={slug}
                finding={finding}
                reportFeedback={reportFeedback}
              />
            ))}
            {column.total === 0 && (
              <Text size="sm" tone="muted">
                No matching findings.
              </Text>
            )}
            {column.nextCursor && (
              <Button
                variant="outline"
                disabled={loading[column.status]}
                aria-label={`Load more ${statusLabels[column.status]} findings`}
                onClick={() => loadMore(column.status, column.nextCursor!)}
              >
                {loading[column.status] ? "Loading…" : "Load more"}
              </Button>
            )}
          </Stack>
        ),
      }))}
    />
  );
}
