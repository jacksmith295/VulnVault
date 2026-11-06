CREATE TABLE "finding_source" (
	"finding_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"service_id" text NOT NULL,
	"kind" text DEFAULT 'github_dependabot' NOT NULL,
	"repository_id" text NOT NULL,
	"alert_number" integer NOT NULL,
	"state" text NOT NULL,
	"upstream_created_at" timestamp NOT NULL,
	"upstream_updated_at" timestamp NOT NULL,
	"package_name" text NOT NULL,
	"ecosystem" text NOT NULL,
	"manifest_path" text NOT NULL,
	"ghsa_id" text NOT NULL,
	"cve_id" text,
	"vulnerable_range" text NOT NULL,
	"patched_version" text,
	"summary" text NOT NULL,
	"severity" text NOT NULL,
	"url" text NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "finding_source_kind_check" CHECK ("finding_source"."kind" = 'github_dependabot'),
	CONSTRAINT "finding_source_state_check" CHECK ("finding_source"."state" IN ('open', 'fixed', 'dismissed', 'auto_dismissed')),
	CONSTRAINT "finding_source_number_check" CHECK ("finding_source"."alert_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "integration_repository" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"integration_id" text NOT NULL,
	"service_id" text NOT NULL,
	"repository_link_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"full_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp,
	"last_success_at" timestamp,
	"error_code" text,
	"failures" integer DEFAULT 0 NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp,
	CONSTRAINT "integration_repository_version_check" CHECK ("integration_repository"."version" >= 1),
	CONSTRAINT "integration_repository_failures_check" CHECK ("integration_repository"."failures" >= 0),
	CONSTRAINT "integration_repository_lease_check" CHECK (("integration_repository"."lease_token" IS NULL) = ("integration_repository"."lease_expires_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "workspace_integration" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"provider" text DEFAULT 'github' NOT NULL,
	"app_id" text NOT NULL,
	"installation_id" text NOT NULL,
	"account_id" text NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"blocked_until" timestamp,
	CONSTRAINT "integration_provider_check" CHECK ("workspace_integration"."provider" = 'github'),
	CONSTRAINT "integration_account_type_check" CHECK ("workspace_integration"."account_type" IN ('User', 'Organization')),
	CONSTRAINT "integration_version_check" CHECK ("workspace_integration"."version" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "integration_workspace_id_unique" ON "workspace_integration" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "finding_service_id_unique" ON "finding" USING btree ("service_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_repository_service_id_unique" ON "service_repository" USING btree ("service_id","id");--> statement-breakpoint
ALTER TABLE "finding_source" ADD CONSTRAINT "finding_source_workspace_id_service_id_service_workspace_id_id_fk" FOREIGN KEY ("workspace_id","service_id") REFERENCES "public"."service"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_source" ADD CONSTRAINT "finding_source_service_id_finding_id_finding_service_id_id_fk" FOREIGN KEY ("service_id","finding_id") REFERENCES "public"."finding"("service_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_repository" ADD CONSTRAINT "integration_repository_workspace_id_integration_id_workspace_integration_workspace_id_id_fk" FOREIGN KEY ("workspace_id","integration_id") REFERENCES "public"."workspace_integration"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_repository" ADD CONSTRAINT "integration_repository_workspace_id_service_id_service_workspace_id_id_fk" FOREIGN KEY ("workspace_id","service_id") REFERENCES "public"."service"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_repository" ADD CONSTRAINT "integration_repository_service_id_repository_link_id_service_repository_service_id_id_fk" FOREIGN KEY ("service_id","repository_link_id") REFERENCES "public"."service_repository"("service_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_integration" ADD CONSTRAINT "workspace_integration_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finding_source_identity_unique" ON "finding_source" USING btree ("service_id","kind","repository_id","alert_number");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_repository_link_unique" ON "integration_repository" USING btree ("repository_link_id");--> statement-breakpoint
CREATE INDEX "integration_repository_due_idx" ON "integration_repository" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_installation_unique" ON "workspace_integration" USING btree ("provider","installation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_workspace_account_unique" ON "workspace_integration" USING btree ("workspace_id","provider","account_id");