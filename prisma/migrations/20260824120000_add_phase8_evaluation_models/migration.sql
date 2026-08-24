-- CreateEnum safely
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EvaluationStatus') THEN
        CREATE TYPE "EvaluationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
    END IF;
END$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "evaluation_datasets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "evaluation_cases" (
    "id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "expected_answer" TEXT,
    "expected_sources" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "evaluation_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "config" JSONB,
    "metrics" JSONB,
    "total_cases" INTEGER NOT NULL DEFAULT 0,
    "completed_cases" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER,
    "token_usage" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "evaluation_results" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "generated_answer" TEXT,
    "retrieved_chunks" JSONB,
    "citations" JSONB,
    "scores" JSONB,
    "latency_ms" INTEGER,
    "passed" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "evaluation_datasets_organization_id_idx" ON "evaluation_datasets"("organization_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "evaluation_cases_dataset_id_idx" ON "evaluation_cases"("dataset_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "evaluation_runs_organization_id_idx" ON "evaluation_runs"("organization_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "evaluation_runs_dataset_id_idx" ON "evaluation_runs"("dataset_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "evaluation_runs_organization_id_status_idx" ON "evaluation_runs"("organization_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "evaluation_results_run_id_idx" ON "evaluation_results"("run_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "evaluation_results_case_id_idx" ON "evaluation_results"("case_id");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evaluation_datasets_organization_id_fkey') THEN
        ALTER TABLE "evaluation_datasets" ADD CONSTRAINT "evaluation_datasets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evaluation_cases_dataset_id_fkey') THEN
        ALTER TABLE "evaluation_cases" ADD CONSTRAINT "evaluation_cases_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "evaluation_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evaluation_runs_organization_id_fkey') THEN
        ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evaluation_runs_dataset_id_fkey') THEN
        ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "evaluation_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evaluation_results_run_id_fkey') THEN
        ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "evaluation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evaluation_results_case_id_fkey') THEN
        ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "evaluation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END$$;
