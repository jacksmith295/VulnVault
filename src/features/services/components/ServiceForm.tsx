"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveServiceAction } from "../actions";
import { serviceSchema } from "../validation";

type ServiceFormProps = { slug: string; service?: { id: string; version: number; name: string; description: string | null; repositoryUrls: string[] } };

export function ServiceForm(props: ServiceFormProps) {
  return <ServiceFormFields key={`${props.slug}:${props.service?.id ?? "new"}`} {...props} />;
}

function ServiceFormFields({ slug, service }: ServiceFormProps) {
  // Keep the version tied to the initial field values when refreshed server props arrive.
  const [version] = useState(service?.version ?? 1);
  const [state, action, pending] = useActionState(saveServiceAction.bind(null, slug, service?.id ?? null, version), { error: "", conflict: false });
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [urls, setUrls] = useState(service?.repositoryUrls.join("\n") ?? "");
  const [validation, setValidation] = useState("");
  return <form action={action} className="max-w-xl space-y-6" onSubmit={(event) => {
    const parsed = serviceSchema.safeParse({ name, description, repositoryUrls: urls.split(/\r?\n/).map((url) => url.trim()).filter(Boolean) });
    setValidation(parsed.success ? "" : parsed.error.issues[0].message);
    if (!parsed.success) event.preventDefault();
  }}>
    <div className="space-y-2"><Label htmlFor="service-name">Name</Label>
      <Input id="service-name" name="name" required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></div>
    <div className="space-y-2"><Label htmlFor="service-description">Description</Label>
      <textarea id="service-description" name="description" maxLength={5000} rows={5} className="w-full rounded-md border bg-transparent p-3 text-sm" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
    <div className="space-y-2"><Label htmlFor="service-repositories">Repository URLs</Label>
      <textarea id="service-repositories" name="repositoryUrls" rows={5} className="w-full rounded-md border bg-transparent p-3 text-sm" aria-describedby="repository-help" value={urls} onChange={(event) => setUrls(event.target.value)} />
      <p id="repository-help" className="text-sm text-muted-foreground">Optional. Enter up to 20 HTTP or HTTPS repository URLs, one per line. Include a repository path and omit credentials, query strings, and fragments.</p></div>
    {(validation || state.error) && <p role="alert" className="text-sm text-destructive">{validation || state.error}</p>}
    {state.conflict && <a className="block text-sm underline" href={`/w/${slug}/services/${service?.id}/edit`}>Reload latest version</a>}
    <Button type="submit" disabled={pending}>{pending ? "Saving service..." : service ? "Save changes" : "Create service"}</Button>
  </form>;
}
