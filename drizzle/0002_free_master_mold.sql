CREATE TABLE "service" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_repository" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"url" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_repository" ADD CONSTRAINT "service_repository_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_workspace_archive_idx" ON "service" USING btree ("workspace_id","archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "service_repository_service_url_unique" ON "service_repository" USING btree ("service_id","url");