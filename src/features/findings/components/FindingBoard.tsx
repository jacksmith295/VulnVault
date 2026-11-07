"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Inline, Stack } from "@/components/layout";
import { StatusBoard } from "./StatusBoard";
import { Badge, SeverityBadge, type SeverityTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BoardCardTitle,
  BoardDragCard,
  BoardDragList,
  BoardDragProvider,
} from "./board-drag";
import { FormMessage } from "@/components/ui/form-message";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuIconTrigger,
} from "@/components/ui/menu";
import { Text } from "@/components/ui/typography";
import type {
  BoardFinding,
  MoreBoardFindings,
  getFindingBoard,
} from "../board-data";
import type { BoardFilters, FindingStatus } from "../board-validation";
import { changeBoardFindingStatusAction } from "../board-actions";
import { statuses, statusLabels, severityLabels } from "../validation";

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
  // Keep the mobile column while refreshed data resets the paginated collection.
  const [selectedStatus, setSelectedStatus] = useState<string>(
    props.filters.status ?? "new",
  );
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
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        pending={pending || refreshing || conflict}
        changeStatus={changeStatus}
      />
    </Stack>
  );
}

function FindingBoardCard({
  slug,
  finding,
  pending,
  dragging,
  changeStatus,
}: {
  slug: string;
  finding: BoardFinding;
  pending: boolean;
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
      actions={
        <Menu>
          <MenuIconTrigger
            disabled={finding.archived || pending || dragging}
            aria-label={`Change status for ${finding.title}`}
          />
          <MenuPopup align="end">
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
      }
    >
      <Stack gap="sm">
        <BoardCardTitle
          href={`/w/${slug}/services/${finding.serviceId}/findings/${finding.id}`}
        >
          {finding.title}
        </BoardCardTitle>
        <Inline>
          <SeverityBadge severity={finding.severity as SeverityTone}>
            {severityLabels[finding.severity as keyof typeof severityLabels]}
          </SeverityBadge>
          {finding.archived && <Badge tone="muted">Archived service</Badge>}
        </Inline>
        <Text size="xs" tone="muted">
          {finding.serviceName}
        </Text>
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
  changeStatus,
  selectedStatus,
  onStatusChange,
}: BoardProps & {
  pending: boolean;
  changeStatus: StatusChange;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
}) {
  const router = useRouter();
  const [columns, setColumns] = useState(initialColumns);
  const [loading, setLoading] = useState<
    Partial<Record<FindingStatus, boolean>>
  >({});
  const [resetting, setResetting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FindingStatus, string>>>(
    {},
  );
  const [pageStatus, setPageStatus] = useState<
    Partial<Record<FindingStatus, string>>
  >({});
  const collectionRef = useRef<HTMLDivElement>(null);
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
    setErrors((previous) => ({ ...previous, [status]: undefined }));
    setPageStatus((previous) => ({ ...previous, [status]: undefined }));
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
      const accessChanged =
        response.redirected ||
        response.status === 401 ||
        response.status === 403;
      if (!accessChanged && !response.ok)
        throw new Error("Could not load findings");
      const result: MoreBoardFindings = accessChanged
        ? { reset: true }
        : await response.json();
      if (
        !active.current ||
        requestGeneration !== generation.current ||
        blocked.current
      )
        return;
      if (result.reset || result.scopeKey !== scopeKey) {
        if (collectionRef.current?.contains(document.activeElement)) {
          // Filters survive both board revisions and changes to its access scope.
          ["filter-desktop-q", "mobile-filters-trigger"]
            .map((id) => document.getElementById(id))
            .find((element) => element && element.getClientRects().length > 0)
            ?.focus();
        }
        active.current = false;
        setColumns([]);
        setResetting(true);
        router.refresh();
        return;
      }
      setPageStatus((previous) => ({
        ...previous,
        [status]: result.nextCursor
          ? `More ${statusLabels[status]} findings loaded.`
          : `All ${statusLabels[status]} findings loaded.`,
      }));
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
        setErrors((previous) => ({
          ...previous,
          [status]: `Unable to load more ${statusLabels[status]} findings. Try again.`,
        }));
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
    <Stack grow ref={collectionRef}>
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
          selectedStatus={selectedStatus}
          onStatusChange={onStatusChange}
          columns={columns.map((column) => ({
            status: column.status,
            label: statusLabels[column.status],
            total: column.total,
            regionLabel: `${statusLabels[column.status]} findings`,
            content: (
              <BoardDragList>
                {column.findings.map((finding) => (
                  <FindingBoardCard
                    key={finding.id}
                    slug={slug}
                    finding={finding}
                    pending={pending}
                    dragging={dragging}
                    changeStatus={moveFinding}
                  />
                ))}
                {column.total === 0 && (
                  <Text size="sm" tone="muted">
                    No matching findings.
                  </Text>
                )}
                {errors[column.status] && (
                  <FormMessage>{errors[column.status]}</FormMessage>
                )}
                {(column.nextCursor ||
                  initialColumns.find(
                    (initial) => initial.status === column.status,
                  )?.nextCursor) && (
                  <Button
                    variant="outline"
                    focusableWhenDisabled
                    disabled={
                      !column.nextCursor ||
                      loading[column.status] ||
                      pending ||
                      dragging
                    }
                    aria-label={
                      column.nextCursor
                        ? `${errors[column.status] ? "Retry loading" : "Load more"} ${statusLabels[column.status]} findings`
                        : `All findings loaded for ${statusLabels[column.status]}`
                    }
                    onClick={() =>
                      column.nextCursor &&
                      loadMore(column.status, column.nextCursor)
                    }
                  >
                    {loading[column.status]
                      ? "Loading…"
                      : !column.nextCursor
                        ? "All findings loaded"
                        : errors[column.status]
                          ? "Retry"
                          : "Load more"}
                  </Button>
                )}
                <Text role="status" aria-live="polite" size="sm" tone="muted">
                  {pageStatus[column.status]}
                </Text>
              </BoardDragList>
            ),
          }))}
        />
      </BoardDragProvider>
    </Stack>
  );
}
