"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BoardFilterActions,
  BoardFilterForm,
  FilterGrid,
} from "@/components/layout/board";
import { ResponsiveFilters } from "@/components/layout/responsive-filters";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/field";
import { TextLink } from "@/components/ui/link";
import { Select } from "@/components/ui/select";
import type { BoardFilters } from "../board-validation";
import type { FindingFilters } from "../filter-validation";
import {
  sourceLabels,
  upstreamLabels,
  findingSources,
  upstreamStates,
} from "../filter-validation";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/typography";
import { Stack } from "@/components/layout";
import {
  severities,
  severityLabels,
  statuses,
  statusLabels,
} from "../validation";

function filterValues(
  filters: FindingFilters & Partial<BoardFilters>,
): Record<string, string> {
  return {
    q: filters.q ?? "",
    source: filters.source ?? "",
    upstream: filters.upstream ?? "",
    group: filters.group ?? "",
    service: filters.service ?? "",
    severity: filters.severity ?? "",
    status: filters.status ?? "",
    archive: filters.archive ?? "active",
  };
}

export function FindingFiltersForm({
  slug,
  navigationKey,
  filters,
  groups,
  services,
  serviceId,
}: {
  slug: string;
  navigationKey: string;
  filters: FindingFilters & Partial<BoardFilters>;
  groups?: { id: string; name: string }[];
  services?: { id: string; name: string }[];
  serviceId?: string;
}) {
  const base = serviceId ? `/w/${slug}/services/${serviceId}` : `/w/${slug}`;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(() => filterValues(filters));
  const [appliedNavigationKey, setAppliedNavigationKey] =
    useState(navigationKey);
  const [requestedNavigationKey, setRequestedNavigationKey] =
    useState<string>();
  if (navigationKey !== appliedNavigationKey) {
    setAppliedNavigationKey(navigationKey);
    setRequestedNavigationKey(undefined);
    // An Apply response must preserve edits made while its board was loading.
    // History navigation instead restores the filters represented by that URL.
    if (navigationKey !== requestedNavigationKey)
      setValues(filterValues(filters));
  }
  const fields = [
    {
      name: "source",
      label: "Source",
      options: [
        { value: "", label: "All sources" },
        ...findingSources.map((value) => ({
          value,
          label: sourceLabels[value],
        })),
      ],
    },
    {
      name: "upstream",
      label: "Upstream state",
      options: [
        { value: "", label: "All upstream states" },
        ...upstreamStates.map((value) => ({
          value,
          label: upstreamLabels[value],
        })),
      ],
    },
    ...(serviceId
      ? []
      : [
          {
            name: "group",
            label: "Group",
            options: [
              { value: "", label: "All accessible groups" },
              ...(groups ?? []).map((group) => ({
                value: group.id,
                label: group.name,
              })),
            ],
          },
          {
            name: "service",
            label: "Service",
            options: [
              { value: "", label: "All accessible services" },
              ...(services ?? []).map((service) => ({
                value: service.id,
                label: service.name,
              })),
            ],
          },
        ]),
    {
      name: "severity",
      label: "Severity",
      options: [
        { value: "", label: "All severities" },
        ...severities.map((value) => ({ value, label: severityLabels[value] })),
      ],
    },
    {
      name: "status",
      label: "Status",
      options: [
        { value: "", label: "All statuses" },
        ...statuses.map((value) => ({ value, label: statusLabels[value] })),
      ],
    },
    ...(serviceId
      ? []
      : [
          {
            name: "archive",
            label: "Service archive state",
            options: [
              { value: "active", label: "Active services" },
              { value: "archived", label: "Archived services" },
              { value: "all", label: "All services" },
            ],
          },
        ]),
  ];
  const appliedCount =
    [
      filters.q,
      filters.source,
      filters.upstream,
      filters.group,
      filters.service,
      filters.severity,
      filters.status,
    ].filter(Boolean).length +
    (!filters.archive || filters.archive === "active" ? 0 : 1);
  return (
    <Stack gap="sm">
      <ResponsiveFilters appliedCount={appliedCount} pending={pending}>
        {(presentation, close) => (
          <BoardFilterForm
            action={base}
            method="get"
            aria-busy={pending}
            onSubmit={(event) => {
              event.preventDefault();
              close();
              const query = new URLSearchParams(
                Object.entries(values).filter(
                  ([name]) =>
                    !serviceId ||
                    !["group", "service", "archive"].includes(name),
                ),
              );
              setRequestedNavigationKey(
                JSON.stringify([...query.entries()].sort()),
              );
              startTransition(() =>
                router.push(`${base}?${query}`, { scroll: false }),
              );
            }}
          >
            <FilterGrid layout={serviceId ? "service" : "board"}>
              <FormField
                id={`filter-${presentation}-q`}
                label="Search findings"
              >
                <Input
                  id={`filter-${presentation}-q`}
                  name="q"
                  type="search"
                  maxLength={200}
                  placeholder="Title, package, GHSA or CVE"
                  value={values.q}
                  onChange={(event) =>
                    setValues((previous) => ({
                      ...previous,
                      q: event.target.value,
                    }))
                  }
                />
              </FormField>
              {fields.map((field) => (
                <FormField
                  key={field.name}
                  id={`filter-${presentation}-${field.name}`}
                  label={field.label}
                >
                  <Select
                    id={`filter-${presentation}-${field.name}`}
                    name={field.name}
                    value={values[field.name]}
                    options={field.options}
                    onValueChange={(value) =>
                      setValues((previous) => ({
                        ...previous,
                        [field.name]: value ?? "",
                      }))
                    }
                  />
                </FormField>
              ))}
              <BoardFilterActions>
                <Button type="submit" disabled={pending}>
                  {pending ? "Applying filters…" : "Apply filters"}
                </Button>
                <TextLink
                  href={base}
                  scroll={false}
                  onClick={(event) => {
                    if (
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    close();
                    setValues(filterValues({ archive: "active" }));
                    setRequestedNavigationKey(JSON.stringify([]));
                    startTransition(() => router.push(base, { scroll: false }));
                  }}
                >
                  Clear filters
                </TextLink>
              </BoardFilterActions>
            </FilterGrid>
            {values.upstream && (
              <Text size="sm" tone="muted">
                Upstream state applies to imported findings. Manual findings
                have no upstream state.
              </Text>
            )}
          </BoardFilterForm>
        )}
      </ResponsiveFilters>
      {filters.source === "manual" && filters.upstream && (
        <Text size="sm" tone="muted">
          Upstream state applies to imported findings. Manual findings have no
          upstream state.
        </Text>
      )}
    </Stack>
  );
}

export const FindingBoardFilters = FindingFiltersForm;
