CREATE TABLE "finding" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"remediation_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "finding_severity_check" CHECK ("finding"."severity" IN ('critical', 'high', 'medium', 'low', 'informational')),
	CONSTRAINT "finding_status_check" CHECK ("finding"."status" IN ('new', 'triaged', 'in_progress', 'resolved', 'rejected', 'accepted_risk')),
	CONSTRAINT "finding_version_check" CHECK ("finding"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "finding_reference" (
	"id" text PRIMARY KEY NOT NULL,
	"finding_id" text NOT NULL,
	"url" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding" ADD CONSTRAINT "finding_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_reference" ADD CONSTRAINT "finding_reference_finding_id_finding_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."finding"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finding_service_created_id_idx" ON "finding" USING btree ("service_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "finding_reference_finding_url_unique" ON "finding_reference" USING btree ("finding_id","url");