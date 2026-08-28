-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('TECHNICIAN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DIAGNOSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EquipmentType" AS ENUM ('CENTRAL_AC', 'HEAT_PUMP', 'GAS_FURNACE', 'ELECTRIC_FURNACE', 'AIR_HANDLER', 'PACKAGE_UNIT', 'ROOFTOP_UNIT', 'MINI_SPLIT', 'DUCTLESS_MULTI', 'VRF', 'DUAL_FUEL', 'GEOTHERMAL', 'BOILER', 'HYDRONIC', 'COMMERCIAL_SPLIT', 'REFRIGERATION', 'WATER_HEATER', 'VENTILATION', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('CONFIRMED', 'PROVISIONAL', 'UNVERIFIED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "SessionPhase" AS ENUM ('INTAKE', 'TRIAGE', 'TESTING', 'CONFIRMING', 'DIAGNOSED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('TECHNICIAN', 'ASSISTANT', 'SYSTEM', 'ENGINE');

-- CreateEnum
CREATE TYPE "PhotoKind" AS ENUM ('NAMEPLATE', 'CONTROL_BOARD', 'FAULT_DISPLAY', 'WIRING', 'COMPONENT', 'GAUGES', 'COIL', 'GENERAL');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'FINAL');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('SERVICE_MANUAL', 'INSTALLATION_MANUAL', 'TROUBLESHOOTING_GUIDE', 'WIRING_DIAGRAM', 'TECHNICAL_BULLETIN', 'FAULT_CODE_SHEET', 'SPECIFICATION', 'TRAINING', 'OTHER');

-- CreateEnum
CREATE TYPE "IngestStatus" AS ENUM ('PENDING', 'EXTRACTING', 'CHUNKING', 'EMBEDDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PRO', 'COMPANY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'TECHNICIAN',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "licenseNumber" TEXT,
    "yearsExp" INTEGER,
    "epaCert" TEXT,
    "companyId" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal" TEXT,
    "logoKey" TEXT,
    "seatsMax" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "userId" TEXT NOT NULL,
    "customerId" TEXT,
    "equipmentId" TEXT,
    "jobNumber" TEXT,
    "title" TEXT NOT NULL,
    "complaint" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'OPEN',
    "siteNotes" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "customerId" TEXT,
    "manufacturerId" TEXT,
    "equipmentModelId" TEXT,
    "controlBoardId" TEXT,
    "type" "EquipmentType" NOT NULL DEFAULT 'UNKNOWN',
    "modelNumber" TEXT,
    "serialNumber" TEXT,
    "refrigerant" TEXT,
    "nominalTons" DOUBLE PRECISION,
    "voltage" TEXT,
    "installedOn" TIMESTAMP(3),
    "location" TEXT,
    "decoded" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Manufacturer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parent" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Manufacturer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentModel" (
    "id" TEXT NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "modelNumber" TEXT,
    "type" "EquipmentType" NOT NULL,
    "description" TEXT,
    "refrigerant" TEXT,
    "stages" INTEGER,
    "minYear" INTEGER,
    "maxYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlBoard" (
    "id" TEXT NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "equipmentModelId" TEXT,
    "partNumber" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "signalStyle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaultCode" (
    "id" TEXT NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "equipmentModelId" TEXT,
    "controlBoardId" TEXT,
    "equipmentType" "EquipmentType" NOT NULL DEFAULT 'UNKNOWN',
    "code" TEXT NOT NULL,
    "displayCode" TEXT,
    "title" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "triggerConditions" TEXT NOT NULL,
    "possibleCauses" JSONB NOT NULL,
    "safetyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "testSequence" JSONB NOT NULL,
    "repairNotes" TEXT,
    "verification" "VerificationStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "sourceDocumentId" TEXT,
    "sourceCitation" TEXT,
    "linkedHypotheses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaultCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticProcedure" (
    "id" TEXT NOT NULL,
    "manufacturerId" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "equipmentTypes" "EquipmentType"[] DEFAULT ARRAY[]::"EquipmentType"[],
    "summary" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "toolsNeeded" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "safetyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estMinutes" INTEGER,
    "verification" "VerificationStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "sourceCitation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,
    "equipmentId" TEXT,
    "title" TEXT NOT NULL,
    "complaint" TEXT NOT NULL,
    "equipmentType" "EquipmentType" NOT NULL DEFAULT 'UNKNOWN',
    "refrigerant" TEXT,
    "mode" TEXT,
    "phase" "SessionPhase" NOT NULL DEFAULT 'INTAKE',
    "engineState" JSONB NOT NULL,
    "conclusion" JSONB,
    "confidence" DOUBLE PRECISION,
    "ruledOut" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "payload" JSONB,
    "citations" JSONB,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "textValue" TEXT,
    "unit" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "derivedFrom" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "jobId" TEXT,
    "equipmentId" TEXT,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "kind" "PhotoKind" NOT NULL DEFAULT 'GENERAL',
    "caption" TEXT,
    "analysis" JSONB,
    "analyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,
    "sessionId" TEXT,
    "reportNumber" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "technicianNotes" TEXT,
    "pdfKey" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "manufacturerId" TEXT,
    "companyId" TEXT,
    "uploadedById" TEXT,
    "title" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL DEFAULT 'OTHER',
    "equipmentTypes" "EquipmentType"[] DEFAULT ARRAY[]::"EquipmentType"[],
    "modelSeries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publication" TEXT,
    "revision" TEXT,
    "year" INTEGER,
    "storageKey" TEXT,
    "sourceUrl" TEXT,
    "pageCount" INTEGER,
    "bytes" INTEGER,
    "checksum" TEXT,
    "status" "IngestStatus" NOT NULL DEFAULT 'PENDING',
    "statusError" TEXT,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "page" INTEGER,
    "section" TEXT,
    "content" TEXT NOT NULL,
    "tokens" INTEGER,
    "manufacturerId" TEXT,
    "companyId" TEXT,
    "equipmentTypes" "EquipmentType"[] DEFAULT ARRAY[]::"EquipmentType"[],
    "embedding" vector(1024),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "tier" "PlanTier" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCentsMonthly" INTEGER NOT NULL,
    "priceCentsYearly" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "stripeProductId" TEXT,
    "stripePriceIdMonthly" TEXT,
    "stripePriceIdYearly" TEXT,
    "maxDiagnosesPerMonth" INTEGER NOT NULL DEFAULT -1,
    "maxPhotosPerMonth" INTEGER NOT NULL DEFAULT -1,
    "maxSeats" INTEGER NOT NULL DEFAULT 1,
    "faultCodeLookup" BOOLEAN NOT NULL DEFAULT true,
    "photoAnalysis" BOOLEAN NOT NULL DEFAULT false,
    "savedJobs" BOOLEAN NOT NULL DEFAULT false,
    "serviceReports" BOOLEAN NOT NULL DEFAULT false,
    "companyDashboard" BOOLEAN NOT NULL DEFAULT false,
    "sharedKnowledge" BOOLEAN NOT NULL DEFAULT false,
    "prioritySupport" BOOLEAN NOT NULL DEFAULT false,
    "featureBullets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "companyId" TEXT,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "diagnosesUsed" INTEGER NOT NULL DEFAULT 0,
    "photosUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "operation" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalCase" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scenario" JSONB NOT NULL,
    "expectations" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvalCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "label" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "totalCases" INTEGER NOT NULL DEFAULT 0,
    "passedCases" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvalRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "checks" JSONB NOT NULL,
    "transcript" JSONB NOT NULL,
    "error" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvalResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE INDEX "Company_slug_idx" ON "Company"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "Customer_companyId_name_idx" ON "Customer"("companyId", "name");

-- CreateIndex
CREATE INDEX "Job_companyId_status_idx" ON "Job"("companyId", "status");

-- CreateIndex
CREATE INDEX "Job_userId_createdAt_idx" ON "Job"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Equipment_companyId_idx" ON "Equipment"("companyId");

-- CreateIndex
CREATE INDEX "Equipment_manufacturerId_modelNumber_idx" ON "Equipment"("manufacturerId", "modelNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_name_key" ON "Manufacturer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_slug_key" ON "Manufacturer"("slug");

-- CreateIndex
CREATE INDEX "Manufacturer_slug_idx" ON "Manufacturer"("slug");

-- CreateIndex
CREATE INDEX "EquipmentModel_manufacturerId_series_idx" ON "EquipmentModel"("manufacturerId", "series");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentModel_manufacturerId_series_modelNumber_key" ON "EquipmentModel"("manufacturerId", "series", "modelNumber");

-- CreateIndex
CREATE INDEX "ControlBoard_manufacturerId_idx" ON "ControlBoard"("manufacturerId");

-- CreateIndex
CREATE UNIQUE INDEX "ControlBoard_manufacturerId_partNumber_key" ON "ControlBoard"("manufacturerId", "partNumber");

-- CreateIndex
CREATE INDEX "FaultCode_manufacturerId_code_idx" ON "FaultCode"("manufacturerId", "code");

-- CreateIndex
CREATE INDEX "FaultCode_code_idx" ON "FaultCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FaultCode_manufacturerId_code_equipmentType_equipmentModelI_key" ON "FaultCode"("manufacturerId", "code", "equipmentType", "equipmentModelId", "controlBoardId");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticProcedure_slug_key" ON "DiagnosticProcedure"("slug");

-- CreateIndex
CREATE INDEX "DiagnosticProcedure_category_idx" ON "DiagnosticProcedure"("category");

-- CreateIndex
CREATE INDEX "DiagnosticSession_userId_startedAt_idx" ON "DiagnosticSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "DiagnosticSession_jobId_idx" ON "DiagnosticSession"("jobId");

-- CreateIndex
CREATE INDEX "DiagnosticSession_phase_idx" ON "DiagnosticSession"("phase");

-- CreateIndex
CREATE INDEX "ConversationMessage_sessionId_createdAt_idx" ON "ConversationMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "Measurement_sessionId_key_idx" ON "Measurement"("sessionId", "key");

-- CreateIndex
CREATE INDEX "Photo_sessionId_idx" ON "Photo"("sessionId");

-- CreateIndex
CREATE INDEX "Photo_userId_createdAt_idx" ON "Photo"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceReport_reportNumber_key" ON "ServiceReport"("reportNumber");

-- CreateIndex
CREATE INDEX "ServiceReport_userId_createdAt_idx" ON "ServiceReport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceReport_jobId_idx" ON "ServiceReport"("jobId");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_manufacturerId_type_idx" ON "KnowledgeDocument"("manufacturerId", "type");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_companyId_idx" ON "KnowledgeDocument"("companyId");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_status_idx" ON "KnowledgeDocument"("status");

-- CreateIndex
CREATE INDEX "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");

-- CreateIndex
CREATE INDEX "DocumentChunk_manufacturerId_idx" ON "DocumentChunk"("manufacturerId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_documentId_ordinal_key" ON "DocumentChunk"("documentId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_tier_key" ON "Plan"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_companyId_key" ON "Subscription"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "AiUsageEvent_createdAt_idx" ON "AiUsageEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AiUsageEvent_userId_createdAt_idx" ON "AiUsageEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageEvent_operation_createdAt_idx" ON "AiUsageEvent"("operation", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvalCase_slug_key" ON "EvalCase"("slug");

-- CreateIndex
CREATE INDEX "EvalRun_createdAt_idx" ON "EvalRun"("createdAt");

-- CreateIndex
CREATE INDEX "EvalResult_caseId_createdAt_idx" ON "EvalResult"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EvalResult_runId_caseId_key" ON "EvalResult"("runId", "caseId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_equipmentModelId_fkey" FOREIGN KEY ("equipmentModelId") REFERENCES "EquipmentModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_controlBoardId_fkey" FOREIGN KEY ("controlBoardId") REFERENCES "ControlBoard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentModel" ADD CONSTRAINT "EquipmentModel_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlBoard" ADD CONSTRAINT "ControlBoard_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlBoard" ADD CONSTRAINT "ControlBoard_equipmentModelId_fkey" FOREIGN KEY ("equipmentModelId") REFERENCES "EquipmentModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaultCode" ADD CONSTRAINT "FaultCode_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaultCode" ADD CONSTRAINT "FaultCode_equipmentModelId_fkey" FOREIGN KEY ("equipmentModelId") REFERENCES "EquipmentModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaultCode" ADD CONSTRAINT "FaultCode_controlBoardId_fkey" FOREIGN KEY ("controlBoardId") REFERENCES "ControlBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaultCode" ADD CONSTRAINT "FaultCode_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "KnowledgeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticProcedure" ADD CONSTRAINT "DiagnosticProcedure_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticSession" ADD CONSTRAINT "DiagnosticSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticSession" ADD CONSTRAINT "DiagnosticSession_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticSession" ADD CONSTRAINT "DiagnosticSession_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DiagnosticSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DiagnosticSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DiagnosticSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceReport" ADD CONSTRAINT "ServiceReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceReport" ADD CONSTRAINT "ServiceReport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceReport" ADD CONSTRAINT "ServiceReport_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DiagnosticSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DiagnosticSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalRun" ADD CONSTRAINT "EvalRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalResult" ADD CONSTRAINT "EvalResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "EvalRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalResult" ADD CONSTRAINT "EvalResult_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "EvalCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Post-schema adjustments that Prisma cannot express in the datamodel.
-- ---------------------------------------------------------------------------

-- Fault-code scoping. A brand-level row has no model and no board, so its
-- scope columns are NULL. Postgres treats NULLs as distinct in a unique index
-- by default, which would let duplicate brand-level rows accumulate silently.
-- NULLS NOT DISTINCT makes the constraint mean what the schema comment says.
DROP INDEX IF EXISTS "FaultCode_manufacturerId_code_equipmentType_equipmentModelI_key";
CREATE UNIQUE INDEX "FaultCode_scope_key"
  ON "FaultCode" ("manufacturerId", "code", "equipmentType", "equipmentModelId", "controlBoardId")
  NULLS NOT DISTINCT;

-- Vector index for knowledge-base retrieval. HNSW gives good recall at
-- interactive latency; cosine distance matches the normalized embeddings the
-- application produces.
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw"
  ON "DocumentChunk"
  USING hnsw ("embedding" vector_cosine_ops);

-- Retrieval always filters by tenant and manufacturer before ranking, so these
-- support the filtered scan that precedes the vector comparison.
CREATE INDEX IF NOT EXISTS "DocumentChunk_company_manufacturer_idx"
  ON "DocumentChunk" ("companyId", "manufacturerId");

-- Case-insensitive fault-code lookup: technicians type "e5" and "E5".
CREATE INDEX IF NOT EXISTS "FaultCode_code_upper_idx" ON "FaultCode" (UPPER("code"));
