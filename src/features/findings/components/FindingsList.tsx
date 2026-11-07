"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EmptyState,
  Inline,
  ItemList,
  ListItem,
  Stack,
} from "@/components/layout";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { TextLink } from "@/components/ui/link";
import { Text } from "@/components/ui/typography";
import type { FindingFilters } from "../filter-validation";
import { sourceLabels, upstreamLabels } from "../filter-validation";
import type { FindingListItem } from "../service-list-data";
import { FindingBadges } from "./FindingBadges";

type ListItemData = Omit<FindingListItem, "createdAt"> & {
  createdAt: Date | string;
};
type MoreResult =
  | { reset: true }
  | {
      reset: false;
      scopeKey: string;
      total: number;
      findings: ListItemData[];
      nextCursor: string | null;
    };

export function FindingsList({
  slug,
  serviceId,
  findings,
  total,
  nextCursor,
  scopeKey,
  filters,
}: {
  slug: string;
  serviceId: string;
  findings: FindingListItem[];
  total: number;
  nextCursor: string | null;
  scopeKey: string;
  filters: FindingFilters;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ListItemData[]>(findings);
  const [cursor, setCursor] = useState(nextCursor);
  const [count, setCount] = useState(total);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const base = `/w/${slug}/services/${serviceId}/findings`;
  const listRegion = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const active = useRef(false);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      request.current?.abort();
    };
  }, [slug, serviceId]);
  const filtered = Object.values(filters).some(Boolean);
  async function loadMore() {
    if (!cursor || request.current || resetting) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams(
        Object.entries(filters).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
      query.set("cursor", cursor);
      query.set("scope", scopeKey);
      const response = await fetch(`${base}/more?${query}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const result: MoreResult =
        response.redirected ||
        response.status === 401 ||
        response.status === 403
          ? { reset: true }
          : response.ok
            ? await response.json()
            : await Promise.reject(new Error("Request failed"));
      if (
        !active.current ||
        controller.signal.aborted ||
        request.current !== controller
      )
        return;
      if (result.reset || result.scopeKey !== scopeKey) {
        setRows([]);
        setCursor(null);
        setResetting(true);
        if (listRegion.current?.contains(document.activeElement)) {
          ["desktop", "mobile"]
            .map((presentation) =>
              document.getElementById(`filter-${presentation}-q`),
            )
            .find((element) => element && element.getClientRects().length > 0)
            ?.focus();
        }
        router.refresh();
        return;
      }
      setRows((previous) => [
        ...previous,
        ...result.findings.filter(
          (item) => !previous.some((row) => row.id === item.id),
        ),
      ]);
      setCursor(result.nextCursor);
      setCount(result.total);
    } catch {
      if (active.current && !controller.signal.aborted)
        setError("Unable to load more findings. Try again.");
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (active.current) setLoading(false);
      }
    }
  }
  return (
    <Stack ref={listRegion}>
      <Text size="sm" tone="muted" role="status" aria-live="polite">
        {resetting
          ? "Access or findings changed. Refreshing findings…"
          : loading
            ? "Loading more findings…"
            : `Showing ${rows.length} of ${count} findings`}
      </Text>
      {!resetting && !rows.length ? (
        <EmptyState
          title={filtered ? "No matching findings" : "No findings yet"}
          description={
            filtered
              ? "Try changing or clearing the filters."
              : "Track vulnerabilities affecting this service."
          }
        />
      ) : (
        <ItemList density="compact">
          {rows.map((finding) => (
            <ListItem key={finding.id} density="compact">
              <Stack gap="sm">
                <TextLink href={`${base}/${finding.id}`}>
                  {finding.title}
                </TextLink>
                <Inline>
                  <FindingBadges
                    severity={finding.severity}
                    status={finding.status}
                  />
                  <Text size="sm" tone="muted">
                    {finding.sourceKind === null
                      ? "Manual"
                      : (sourceLabels[
                          finding.sourceKind as keyof typeof sourceLabels
                        ] ?? "Imported")}
                    {finding.upstreamState
                      ? ` · ${upstreamLabels[finding.upstreamState as keyof typeof upstreamLabels] ?? finding.upstreamState}`
                      : ""}
                  </Text>
                </Inline>
              </Stack>
            </ListItem>
          ))}
        </ItemList>
      )}
      {error && <FormMessage>{error}</FormMessage>}
      {(nextCursor || cursor || resetting || loading) && (
        <Inline>
          <Button
            type="button"
            focusableWhenDisabled
            disabled={loading || resetting || !cursor}
            onClick={loadMore}
          >
            {resetting
              ? "Refreshing findings…"
              : loading
                ? "Loading more…"
                : cursor
                  ? "Load more findings"
                  : "All findings loaded"}
          </Button>
        </Inline>
      )}
    </Stack>
  );
}
