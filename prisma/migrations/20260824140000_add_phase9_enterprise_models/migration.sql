-- AlterEnum OrganizationRole to add VIEWER if not present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'VIEWER' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'OrganizationRole')
    ) THEN
        ALTER TYPE "OrganizationRole" ADD VALUE 'VIEWER';
    END IF;
END$$;

-- CreateEnum PermissionGranteeType
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PermissionGranteeType') THEN
        CREATE TYPE "PermissionGranteeType" AS ENUM ('USER', 'ROLE', 'ORGANIZATION');
    END IF;
END$$;

-- CreateEnum PermissionLevel
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PermissionLevel') THEN
        CREATE TYPE "PermissionLevel" AS ENUM ('READ', 'WRITE', 'ADMIN');
    END IF;
END$$;

-- CreateEnum QuotaPlan
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuotaPlan') THEN
        CREATE TYPE "QuotaPlan" AS ENUM ('FREE', 'PRO', 'TEAM', 'ENTERPRISE');
    END IF;
END$$;

-- AlterTable organizations to add slug and status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='slug') THEN
        ALTER TABLE "organizations" ADD COLUMN "slug" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organizations' AND column_name='status') THEN
        ALTER TABLE "organizations" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
    END IF;
END$$;

-- Create unique index on organizations slug
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_key" ON "organizations"("slug");

-- AlterTable organization_members to add status and updatedAt
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organization_members' AND column_name='status') THEN
        ALTER TABLE "organization_members" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organization_members' AND column_name='updated_at') THEN
        ALTER TABLE "organization_members" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;
END$$;

-- AlterTable documents to add content_hash
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='content_hash') THEN
        ALTER TABLE "documents" ADD COLUMN "content_hash" TEXT;
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS "documents_content_hash_idx" ON "documents"("content_hash");

-- AlterTable evaluation_runs to add regression_detected
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='evaluation_runs' AND column_name='regression_detected') THEN
        ALTER TABLE "evaluation_runs" ADD COLUMN "regression_detected" BOOLEAN NOT NULL DEFAULT false;
    END IF;
END$$;

-- CreateTable document_permissions
CREATE TABLE IF NOT EXISTS "document_permissions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "grantee_type" "PermissionGranteeType" NOT NULL,
    "grantee_id" UUID,
    "grantee_role" "OrganizationRole",
    "permission" "PermissionLevel" NOT NULL DEFAULT 'READ',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable api_keys
CREATE TABLE IF NOT EXISTS "api_keys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "hashed_secret" TEXT NOT NULL,
    "scopes" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable document_versions
CREATE TABLE IF NOT EXISTS "document_versions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "summary" TEXT,
    "metadata" JSONB,
    "queryable" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable document_intelligence
CREATE TABLE IF NOT EXISTS "document_intelligence" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "title" TEXT,
    "language" TEXT DEFAULT 'en',
    "classification" TEXT,
    "summary" TEXT,
    "sections" JSONB,
    "entities" JSONB,
    "keywords" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_intelligence_pkey" PRIMARY KEY ("id")
);

-- CreateTable entities
CREATE TABLE IF NOT EXISTS "entities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable entity_relations
CREATE TABLE IF NOT EXISTS "entity_relations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "source_entity_id" UUID NOT NULL,
    "target_entity_id" UUID NOT NULL,
    "relation_type" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable audit_logs
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "request_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable usage_records
CREATE TABLE IF NOT EXISTS "usage_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "event_type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "units" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable usage_daily_aggregates
CREATE TABLE IF NOT EXISTS "usage_daily_aggregates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "date" TEXT NOT NULL,
    "queries_count" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "embeddings_count" INTEGER NOT NULL DEFAULT 0,
    "storage_bytes" BIGINT NOT NULL DEFAULT 0,
    "api_requests" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_daily_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateTable organization_quotas
CREATE TABLE IF NOT EXISTS "organization_quotas" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan" "QuotaPlan" NOT NULL DEFAULT 'FREE',
    "max_documents" INTEGER NOT NULL DEFAULT 100,
    "max_storage_bytes" BIGINT NOT NULL DEFAULT 524288000,
    "max_queries_per_month" INTEGER NOT NULL DEFAULT 1000,
    "max_tokens_per_month" INTEGER NOT NULL DEFAULT 1000000,
    "max_api_requests" INTEGER NOT NULL DEFAULT 10000,
    "max_members" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_quotas_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "document_permissions_document_id_idx" ON "document_permissions"("document_id");
CREATE INDEX IF NOT EXISTS "document_permissions_grantee_id_idx" ON "document_permissions"("grantee_id");
CREATE INDEX IF NOT EXISTS "document_permissions_document_id_grantee_type_idx" ON "document_permissions"("document_id", "grantee_type");

CREATE INDEX IF NOT EXISTS "api_keys_organization_id_idx" ON "api_keys"("organization_id");
CREATE INDEX IF NOT EXISTS "api_keys_key_prefix_idx" ON "api_keys"("key_prefix");
CREATE INDEX IF NOT EXISTS "api_keys_organization_id_revoked_at_idx" ON "api_keys"("organization_id", "revoked_at");

CREATE UNIQUE INDEX IF NOT EXISTS "document_versions_document_id_version_number_key" ON "document_versions"("document_id", "version_number");
CREATE INDEX IF NOT EXISTS "document_versions_document_id_idx" ON "document_versions"("document_id");
CREATE INDEX IF NOT EXISTS "document_versions_content_hash_idx" ON "document_versions"("content_hash");

CREATE UNIQUE INDEX IF NOT EXISTS "document_intelligence_document_id_key" ON "document_intelligence"("document_id");

CREATE UNIQUE INDEX IF NOT EXISTS "entities_organization_id_name_type_key" ON "entities"("organization_id", "name", "type");
CREATE INDEX IF NOT EXISTS "entities_organization_id_idx" ON "entities"("organization_id");
CREATE INDEX IF NOT EXISTS "entities_name_idx" ON "entities"("name");

CREATE UNIQUE INDEX IF NOT EXISTS "entity_relations_organization_id_source_target_type_key" ON "entity_relations"("organization_id", "source_entity_id", "target_entity_id", "relation_type");
CREATE INDEX IF NOT EXISTS "entity_relations_organization_id_idx" ON "entity_relations"("organization_id");
CREATE INDEX IF NOT EXISTS "entity_relations_source_entity_id_idx" ON "entity_relations"("source_entity_id");
CREATE INDEX IF NOT EXISTS "entity_relations_target_entity_id_idx" ON "entity_relations"("target_entity_id");

CREATE INDEX IF NOT EXISTS "audit_logs_organization_id_idx" ON "audit_logs"("organization_id");
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX IF NOT EXISTS "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");
CREATE INDEX IF NOT EXISTS "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

CREATE INDEX IF NOT EXISTS "usage_records_organization_id_idx" ON "usage_records"("organization_id");
CREATE INDEX IF NOT EXISTS "usage_records_event_type_idx" ON "usage_records"("event_type");
CREATE INDEX IF NOT EXISTS "usage_records_organization_id_created_at_idx" ON "usage_records"("organization_id", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "usage_daily_aggregates_organization_id_date_key" ON "usage_daily_aggregates"("organization_id", "date");
CREATE INDEX IF NOT EXISTS "usage_daily_aggregates_organization_id_idx" ON "usage_daily_aggregates"("organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "organization_quotas_organization_id_key" ON "organization_quotas"("organization_id");

-- Foreign Keys
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_permissions_document_id_fkey') THEN
        ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_permissions_grantee_id_fkey') THEN
        ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_grantee_id_fkey" FOREIGN KEY ("grantee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_organization_id_fkey') THEN
        ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_created_by_fkey') THEN
        ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_versions_document_id_fkey') THEN
        ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_versions_created_by_fkey') THEN
        ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_intelligence_document_id_fkey') THEN
        ALTER TABLE "document_intelligence" ADD CONSTRAINT "document_intelligence_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entities_organization_id_fkey') THEN
        ALTER TABLE "entities" ADD CONSTRAINT "entities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entity_relations_organization_id_fkey') THEN
        ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entity_relations_source_entity_id_fkey') THEN
        ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_source_entity_id_fkey" FOREIGN KEY ("source_entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entity_relations_target_entity_id_fkey') THEN
        ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_target_entity_id_fkey" FOREIGN KEY ("target_entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_organization_id_fkey') THEN
        ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_user_id_fkey') THEN
        ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_records_organization_id_fkey') THEN
        ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_daily_aggregates_organization_id_fkey') THEN
        ALTER TABLE "usage_daily_aggregates" ADD CONSTRAINT "usage_daily_aggregates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_quotas_organization_id_fkey') THEN
        ALTER TABLE "organization_quotas" ADD CONSTRAINT "organization_quotas_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END$$;
