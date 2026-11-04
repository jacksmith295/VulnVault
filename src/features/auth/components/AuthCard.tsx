import type { ReactNode } from "react";
import { AuthSurface, Stack } from "@/components/layout";
import { Heading, Text } from "@/components/ui/typography";

type AuthCardProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <AuthSurface>
      <Stack gap="lg">
        <Stack gap="sm">
          <Heading level={1}>{title}</Heading>
          <Text tone="muted">{description}</Text>
        </Stack>
        {children}
      </Stack>
    </AuthSurface>
  );
}
