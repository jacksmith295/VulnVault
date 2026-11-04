// Generated from Better Auth 1.7.16; membership uniqueness is an application constraint.
import { relations, sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  pgTable,
  uuid,
  text,
  bigint,
  timestamp,
  boolean,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  createdAt: timestamp("created_at").notNull(),
  metadata: text("metadata"),
});

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("member_organizationId_idx").on(table.organizationId),
    index("member_userId_idx").on(table.userId),
    uniqueIndex("member_organization_user_unique").on(
      table.organizationId,
      table.userId,
    ),
    uniqueIndex("member_workspace_id_unique").on(
      table.organizationId,
      table.id,
    ),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_organizationId_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  members: many(member),
  invitations: many(invitation),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

// Preserve the pre-authentication scaffold table and its rows. New logins use Better Auth.
export const legacyUsers = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
});

export const service = pgTable(
  "service",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    index("service_workspace_archive_idx").on(
      table.workspaceId,
      table.archivedAt,
    ),
    uniqueIndex("service_workspace_id_unique").on(table.workspaceId, table.id),
  ],
);

export const serviceRepository = pgTable(
  "service_repository",
  {
    id: text("id").primaryKey(),
    serviceId: text("service_id")
      .notNull()
      .references(() => service.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
  },
  (table) => [
    uniqueIndex("service_repository_service_url_unique").on(
      table.serviceId,
      table.url,
    ),
  ],
);

export const finding = pgTable(
  "finding",
  {
    id: text("id").primaryKey(),
    serviceId: text("service_id")
      .notNull()
      .references(() => service.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    severity: text("severity").notNull(),
    status: text("status").default("new").notNull(),
    remediationNotes: text("remediation_notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
    version: integer("version").default(1).notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("finding_service_created_id_idx").on(
      table.serviceId,
      table.createdAt,
      table.id,
    ),
    check(
      "finding_severity_check",
      sql`${table.severity} IN ('critical', 'high', 'medium', 'low', 'informational')`,
    ),
    check(
      "finding_status_check",
      sql`${table.status} IN ('new', 'triaged', 'in_progress', 'resolved', 'rejected', 'accepted_risk')`,
    ),
    check("finding_version_check", sql`${table.version} >= 1`),
  ],
);

export const findingReference = pgTable(
  "finding_reference",
  {
    id: text("id").primaryKey(),
    findingId: text("finding_id")
      .notNull()
      .references(() => finding.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
  },
  (table) => [
    uniqueIndex("finding_reference_finding_url_unique").on(
      table.findingId,
      table.url,
    ),
  ],
);

export const workspaceGroup = pgTable(
  "workspace_group",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    version: integer("version").default(1).notNull(),
  },
  (t) => [
    uniqueIndex("group_workspace_id_default_unique").on(
      t.workspaceId,
      t.id,
      t.isDefault,
    ),
    uniqueIndex("group_workspace_name_unique").on(
      t.workspaceId,
      sql`lower(${t.name})`,
    ),
    uniqueIndex("group_workspace_default_unique")
      .on(t.workspaceId)
      .where(sql`${t.isDefault}`),
    check(
      "group_default_name_check",
      sql`NOT ${t.isDefault} OR ${t.name} = 'Everyone'`,
    ),
    check("group_version_check", sql`${t.version} >= 1`),
    check("group_name_check", sql`length(trim(${t.name})) BETWEEN 2 AND 100`),
  ],
);

// The false discriminator lets the composite foreign key reject default-group associations.
export const groupMembership = pgTable(
  "group_membership",
  {
    workspaceId: text("workspace_id").notNull(),
    groupId: text("group_id").notNull(),
    memberId: text("member_id").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
  },
  (t) => [
    uniqueIndex("group_membership_unique").on(t.groupId, t.memberId),
    foreignKey({
      columns: [t.workspaceId, t.groupId, t.isDefault],
      foreignColumns: [
        workspaceGroup.workspaceId,
        workspaceGroup.id,
        workspaceGroup.isDefault,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.workspaceId, t.memberId],
      foreignColumns: [member.organizationId, member.id],
    }).onDelete("cascade"),
    check("group_membership_custom_check", sql`NOT ${t.isDefault}`),
  ],
);

export const serviceAccessGroup = pgTable(
  "service_access_group",
  {
    workspaceId: text("workspace_id").notNull(),
    serviceId: text("service_id").notNull(),
    groupId: text("group_id").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
  },
  (t) => [
    uniqueIndex("service_access_group_unique").on(t.serviceId, t.groupId),
    foreignKey({
      columns: [t.workspaceId, t.groupId, t.isDefault],
      foreignColumns: [
        workspaceGroup.workspaceId,
        workspaceGroup.id,
        workspaceGroup.isDefault,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.workspaceId, t.serviceId],
      foreignColumns: [service.workspaceId, service.id],
    }).onDelete("cascade"),
    check("service_access_custom_check", sql`NOT ${t.isDefault}`),
  ],
);
