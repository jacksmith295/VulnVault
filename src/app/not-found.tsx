import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/layout";
import { TextLink } from "@/components/ui/link";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <Page width="narrow">
      <PageHeader title="404" description="This page could not be found." />
      <TextLink href="/dashboard">Go to dashboard</TextLink>
    </Page>
  );
}
