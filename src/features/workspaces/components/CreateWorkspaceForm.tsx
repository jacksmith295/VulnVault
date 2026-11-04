"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWorkspaceAction } from "../actions";
import { suggestSlug } from "../validation";

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspaceAction, { error: "" });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  return <form action={action} className="max-w-lg space-y-6">
    <div className="space-y-2">
      <Label htmlFor="workspace-name">Workspace name</Label>
      <Input id="workspace-name" name="name" required minLength={2} maxLength={100} value={name} onChange={(event) => {
        setName(event.target.value);
        if (!slugEdited) setSlug(suggestSlug(event.target.value));
      }} />
    </div>
    <div className="space-y-2">
      <Label htmlFor="workspace-slug">URL slug</Label>
      <Input id="workspace-slug" name="slug" required minLength={3} maxLength={63} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(event.target.value); }} aria-describedby="slug-help" />
      <p id="slug-help" className="text-sm text-muted-foreground">Use lowercase letters and numbers separated by single hyphens. This becomes /w/{slug || "your-workspace"}.</p>
    </div>
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    <Button type="submit" disabled={pending}>{pending ? "Creating workspace..." : "Create workspace"}</Button>
  </form>;
}
