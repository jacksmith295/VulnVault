"use client";

import { useState } from "react";
import { FormActions, FormLayout } from "@/components/layout";
import { FilterGrid } from "@/components/layout/board";
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

export function FindingBoardFilters({
  slug,
  filters,
  groups,
  services,
}: {
  slug: string;
  filters: BoardFilters;
  groups: { id: string; name: string }[];
  services: { id: string; name: string }[];
}) {
  const [values, setValues] = useState<Record<string, string>>({
    group: filters.group ?? "",
    service: filters.service ?? "",
    severity: filters.severity ?? "",
    status: filters.status ?? "",
    archive: filters.archive,
  });
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
  return (
    <FormLayout action={`/w/${slug}/findings`} method="get" tone="surface">
      <FilterGrid>
        {fields.map((field) => (
          <FormField
            key={field.name}
            id={`filter-${field.name}`}
            label={field.label}
          >
            <Select
              id={`filter-${field.name}`}
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
      </FilterGrid>
      <FormActions>
        <Button type="submit">Apply filters</Button>
        <TextLink href={`/w/${slug}/findings`}>Clear filters</TextLink>
      </FormActions>
    </FormLayout>
  );
}
