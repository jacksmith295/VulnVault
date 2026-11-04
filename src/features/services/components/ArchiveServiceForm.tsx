"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { archiveServiceAction } from "../actions";

export function ArchiveServiceForm({ slug, id, version, archived }: { slug: string; id: string; version: number; archived: boolean }) {
  const [state, action, pending] = useActionState(archiveServiceAction.bind(null, slug, id, version, !archived), { error: "", conflict: false });
  return <form action={action} className="space-y-3 rounded-lg border p-5">
    <p className="text-sm text-muted-foreground">{archived ? "Restore this service to the active list so it can be edited." : "Archiving preserves details and repositories and removes this service from the active list."}</p>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirmed" value="yes" required />
      {archived ? "I want to restore this service to the active list." : "I understand this service will leave the active list."}</label>
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    {state.conflict && <a className="block text-sm underline" href={`/w/${slug}/services/${id}`}>Reload latest version</a>}
    <Button type="submit" disabled={pending}>{pending ? "Updating service..." : archived ? "Restore service" : "Archive service"}</Button>
  </form>;
}
