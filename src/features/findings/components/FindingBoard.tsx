"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Inline, Stack } from "@/components/layout";
import { StatusBoard } from "@/components/layout/board";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BoardCardTitle,
  BoardDragCard,
  BoardDragProvider,
} from "@/components/ui/board-drag";
import { FormMessage } from "@/components/ui/form-message";
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
type StatusFeedback =
  | { error: string; conflict?: boolean; success?: never }
  | { success: string; error?: never; conflict?: never }
  | undefined;
type BoardProps = {
  slug: string;
  filters: BoardFilters;
  initialColumns: Columns;
  scopeKey: string;
};
type StatusChange = (finding: BoardFinding, status: FindingStatus) => void;
type Mutation = {
  id: string;
  title: string;
  status: FindingStatus;
  revision: string;
  settled: boolean;
};

export function FindingBoard({
  revisionKey,
  ...props
}: BoardProps & { revisionKey: string }) {
  const router = useRouter();
  // Server refreshes replace loaded pages, while action feedback survives the response.
  const [feedback, setFeedback] = useState<StatusFeedback>();
  const [mutation, setMutation] = useState<Mutation>();
  const gate = useRef(false);
  const mounted = useRef(true);
  const [refreshing, startRefresh] = useTransition();
  const pending = Boolean(
    mutation && (!mutation.settled || mutation.revision === revisionKey),
  );
  const conflict = Boolean(
    feedback?.conflict && mutation?.revision === revisionKey,
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!pending && !refreshing) gate.current = false;
  }, [pending, refreshing, revisionKey]);
  function changeStatus(finding: BoardFinding, status: FindingStatus) {
    if (
      gate.current ||
      pending ||
      refreshing ||
      conflict ||
      finding.archived ||
      finding.status === status
    )
      return;
    gate.current = true;
    setFeedback(undefined);
    setMutation({
      id: finding.id,
      title: finding.title,
      status,
      revision: revisionKey,
      settled: false,
    });
    void (async () => {
      try {
        const result = await changeBoardFindingStatusAction(
          props.slug,
          finding.serviceId,
          finding.id,
          finding.version,
          status,
        );
        if (!mounted.current) return;
        if (result.error !== undefined) {
          setFeedback({
            error: `${finding.title}: ${result.error}`,
            conflict: result.conflict,
          });
          setMutation((previous) => previous && { ...previous, settled: true });
          // An unsuccessful response can leave a stale card on screen. Require
          // authoritative data before accepting another action from that card.
          startRefresh(() => router.refresh());
        } else {
          setFeedback({
            success: `${finding.title} moved to ${statusLabels[status]}.`,
          });
          setMutation((previous) => previous && { ...previous, settled: true });
          startRefresh(() => router.refresh());
        }
      } catch {
        if (!mounted.current) return;
        setFeedback({
          error: `${finding.title}: Could not change this finding. Refresh the board and try again.`,
          conflict: true,
        });
        setMutation((previous) => previous && { ...previous, settled: true });
        startRefresh(() => router.refresh());
      }
    })();
  }
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    // A moved card can leave the current column or filter. Keep focus on a
    // persistent result instead of the menu trigger removed by the refresh.
    if (feedback?.success || feedback?.error) feedbackRef.current?.focus();
  }, [feedback?.success, feedback?.error]);
  return (
    <Stack grow>
      {!feedback && !pending && (
        <FormMessage tone="info">
          Drag a finding to change its status, or use its menu.
        </FormMessage>
      )}
      {pending && !feedback && mutation && (
        <FormMessage tone="info">
          Updating {mutation.title} to {statusLabels[mutation.status]}…
        </FormMessage>
      )}
      {feedback?.error && (
        <FormMessage tabIndex={-1} ref={feedbackRef}>
          {feedback.error}
        </FormMessage>
      )}
      {feedback?.success && (
        <FormMessage tone="success" tabIndex={-1} ref={feedbackRef}>
          {feedback.success}
        </FormMessage>
      )}
      {feedback?.conflict && (
        <Button
          variant="outline"
          onClick={() => {
            gate.current = true;
            setFeedback(undefined);
            startRefresh(() => router.refresh());
          }}
        >
          Refresh board
        </Button>
      )}
      <FindingBoardCollection
        key={revisionKey}
        {...props}
        pending={pending || refreshing || conflict}
        pendingId={pending ? mutation?.id : undefined}
        changeStatus={changeStatus}
      />
    </Stack>
  );
}

function FindingBoardCard({
  slug,
  finding,
  pending,
  updating,
  dragging,
  changeStatus,
}: {
  slug: string;
  finding: BoardFinding;
  pending: boolean;
  updating: boolean;
  dragging: boolean;
  changeStatus: StatusChange;
}) {
  return (
    <BoardDragCard
      id={finding.id}
      severity={finding.severity}
      status={finding.status}
      title={finding.title}
      disabled={finding.archived || pending}
    >
      <Stack gap="sm">
        <BoardCardTitle
          href={`/w/${slug}/services/${finding.serviceId}/findings/${finding.id}`}
        >
          {finding.title}
        </BoardCardTitle>
        <FindingBadges severity={finding.severity} status={finding.status} />
        <Text size="sm" tone="muted">
          {finding.serviceName}
        </Text>
        <Inline>
          {finding.archived && <Badge tone="muted">Archived service</Badge>}
          <Menu>
            <MenuTrigger
              disabled={finding.archived || pending || dragging}
              aria-label={`Change status for ${finding.title}`}
            >
              {updating ? "Updating…" : "Change status"}
            </MenuTrigger>
            <MenuPopup>
              {statuses.map((status) => (
                <MenuItem
                  key={status}
                  disabled={status === finding.status || pending}
                  onClick={() => changeStatus(finding, status)}
                >
                  {statusLabels[status]}
                </MenuItem>
              ))}
            </MenuPopup>
          </Menu>
        </Inline>
      </Stack>
    </BoardDragCard>
  );
}

function FindingBoardCollection({
  slug,
  filters,
  initialColumns,
  scopeKey,
  pending,
  pendingId,
  changeStatus,
}: BoardProps & {
  pending: boolean;
  pendingId?: string;
  changeStatus: StatusChange;
}) {
  const router = useRouter();
  const [columns, setColumns] = useState(initialColumns);
  const [loading, setLoading] = useState<
    Partial<Record<FindingStatus, boolean>>
  >({});
  const [resetting, setResetting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const generation = useRef(0);
  const blocked = useRef(false);
  useEffect(() => {
    blocked.current = pending || dragging;
  }, [pending, dragging]);
  function draggingChanged(value: boolean) {
    blocked.current = value || pending;
    if (value) generation.current += 1;
    setDragging(value);
  }
  function moveFinding(finding: BoardFinding, status: FindingStatus) {
    generation.current += 1;
    blocked.current = true;
    changeStatus(finding, status);
  }
  const active = useRef(true);
  const requests = useRef(new Set<FindingStatus>());
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function loadMore(status: FindingStatus, cursor: string) {
    if (requests.current.has(status) || resetting || blocked.current) return;
    const requestGeneration = generation.current;
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
      if (
        !active.current ||
        requestGeneration !== generation.current ||
        blocked.current
      )
        return;
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
      if (
        active.current &&
        requestGeneration === generation.current &&
        !blocked.current
      ) {
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
    <BoardDragProvider
      disabled={pending || resetting}
      onDraggingChange={draggingChanged}
      onMove={(id, status) => {
        const finding = columns
          .flatMap((column) => column.findings)
          .find((item) => item.id === id);
        if (
          finding &&
          statuses.includes(status as FindingStatus) &&
          finding.status !== status
        )
          moveFinding(finding, status as FindingStatus);
      }}
    >
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
                  pending={pending}
                  dragging={dragging}
                  updating={pendingId === finding.id}
                  changeStatus={moveFinding}
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
                  disabled={loading[column.status] || pending || dragging}
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
    </BoardDragProvider>
  );
}
