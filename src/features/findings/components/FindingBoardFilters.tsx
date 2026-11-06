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
import {
  severities,
  severityLabels,
  statuses,
  statusLabels,
} from "../validation";

function filterValues(filters: BoardFilters): Record<string, string> {
  return {
    group: filters.group ?? "",
    service: filters.service ?? "",
    severity: filters.severity ?? "",
    status: filters.status ?? "",
    archive: filters.archive,
  };
}

export function FindingBoardFilters({
  slug,
  navigationKey,
  filters,
  groups,
  services,
}: {
  slug: string;
  navigationKey: string;
  filters: BoardFilters;
  groups: { id: string; name: string }[];
  services: { id: string; name: string }[];
}) {
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
      name: "group",
      label: "Group",
      options: [
        { value: "", label: "All accessible groups" },
        ...groups.map((group) => ({ value: group.id, label: group.name })),
      ],
    },
    {
      name: "service",
      label: "Service",
      options: [
        { value: "", label: "All accessible services" },
        ...services.map((service) => ({
          value: service.id,
          label: service.name,
        })),
      ],
    },
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
    {
      name: "archive",
      label: "Service archive state",
      options: [
        { value: "active", label: "Active services" },
        { value: "archived", label: "Archived services" },
        { value: "all", label: "All services" },
      ],
    },
  ];
  const appliedCount =
    [filters.group, filters.service, filters.severity, filters.status].filter(
      Boolean,
    ).length + (filters.archive === "active" ? 0 : 1);
  return (
    <ResponsiveFilters appliedCount={appliedCount} pending={pending}>
      {(presentation, close) => (
        <BoardFilterForm
          action={`/w/${slug}`}
          method="get"
          aria-busy={pending}
          onSubmit={(event) => {
            event.preventDefault();
            close();
            const query = new URLSearchParams(values);
            setRequestedNavigationKey(
              JSON.stringify([...query.entries()].sort()),
            );
            startTransition(() =>
              router.push(`/w/${slug}?${query}`, { scroll: false }),
            );
          }}
        >
          <FilterGrid>
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
                href={`/w/${slug}`}
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
                  startTransition(() =>
                    router.push(`/w/${slug}`, { scroll: false }),
                  );
                }}
              >
                Clear filters
              </TextLink>
            </BoardFilterActions>
          </FilterGrid>
        </BoardFilterForm>
      )}
    </ResponsiveFilters>
  );
}
