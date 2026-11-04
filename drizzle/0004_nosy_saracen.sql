CREATE TABLE "group_membership" (
	"workspace_id" text NOT NULL,
	"group_id" text NOT NULL,
	"member_id" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "group_membership_custom_check" CHECK (NOT "group_membership"."is_default")
);

--> statement-breakpoint

CREATE TABLE "service_access_group" (
	"workspace_id" text NOT NULL,
	"service_id" text NOT NULL,
	"group_id" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "service_access_custom_check" CHECK (NOT "service_access_group"."is_default")
);

--> statement-breakpoint

CREATE TABLE "workspace_group" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "group_default_name_check" CHECK (NOT "workspace_group"."is_default" OR "workspace_group"."name" = 'Everyone'),
	CONSTRAINT "group_version_check" CHECK ("workspace_group"."version" >= 1),
	CONSTRAINT "group_name_check" CHECK (length(trim("workspace_group"."name")) BETWEEN 2 AND 100)
);

--> statement-breakpoint

CREATE UNIQUE INDEX "group_membership_unique" ON "group_membership" USING btree ("group_id","member_id");
--> statement-breakpoint

CREATE UNIQUE INDEX "service_access_group_unique" ON "service_access_group" USING btree ("service_id","group_id");
--> statement-breakpoint

CREATE UNIQUE INDEX "group_workspace_id_default_unique" ON "workspace_group" USING btree ("workspace_id","id","is_default");
--> statement-breakpoint

CREATE UNIQUE INDEX "group_workspace_name_unique" ON "workspace_group" USING btree ("workspace_id",lower("name"));
--> statement-breakpoint

CREATE UNIQUE INDEX "group_workspace_default_unique" ON "workspace_group" USING btree ("workspace_id") WHERE "workspace_group"."is_default";
--> statement-breakpoint

CREATE UNIQUE INDEX "member_workspace_id_unique" ON "member" USING btree ("organization_id","id");
--> statement-breakpoint

CREATE UNIQUE INDEX "service_workspace_id_unique" ON "service" USING btree ("workspace_id","id");

--> statement-breakpoint

ALTER TABLE "group_membership" ADD CONSTRAINT "group_membership_workspace_id_group_id_is_default_workspace_group_workspace_id_id_is_default_fk" FOREIGN KEY ("workspace_id","group_id","is_default") REFERENCES "public"."workspace_group"("workspace_id","id","is_default") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "group_membership" ADD CONSTRAINT "group_membership_workspace_id_member_id_member_organization_id_id_fk" FOREIGN KEY ("workspace_id","member_id") REFERENCES "public"."member"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "service_access_group" ADD CONSTRAINT "service_access_group_workspace_id_group_id_is_default_workspace_group_workspace_id_id_is_default_fk" FOREIGN KEY ("workspace_id","group_id","is_default") REFERENCES "public"."workspace_group"("workspace_id","id","is_default") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "service_access_group" ADD CONSTRAINT "service_access_group_workspace_id_service_id_service_workspace_id_id_fk" FOREIGN KEY ("workspace_id","service_id") REFERENCES "public"."service"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "workspace_group" ADD CONSTRAINT "workspace_group_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

INSERT INTO workspace_group (id, workspace_id, name, is_default)
SELECT gen_random_uuid()::text, id, 'Everyone', true FROM organization;

--> statement-breakpoint

CREATE FUNCTION protect_default_group() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_default AND (TG_OP <> 'DELETE' OR EXISTS (SELECT 1 FROM organization WHERE id = OLD.workspace_id)) THEN
    RAISE EXCEPTION 'The default group is protected';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

--> statement-breakpoint

CREATE TRIGGER workspace_group_protect_default BEFORE UPDATE OR DELETE ON workspace_group
FOR EACH ROW EXECUTE FUNCTION protect_default_group();
