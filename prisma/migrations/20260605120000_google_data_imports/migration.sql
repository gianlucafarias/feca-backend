-- CreateEnum
CREATE TYPE "GoogleDataImportStatus" AS ENUM ('pending', 'authorizing', 'fetching', 'processing', 'complete', 'failed', 'revoked');

-- CreateEnum
CREATE TYPE "GoogleDataImportConsentType" AS ENUM ('one_time', 'time_based');

-- CreateEnum
CREATE TYPE "GoogleDataImportItemKind" AS ENUM ('saved_place', 'visit');

-- CreateEnum
CREATE TYPE "GoogleDataImportItemConfidence" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "GoogleDataImportItemStatus" AS ENUM ('parsed', 'matched', 'skipped', 'manual_review');

-- CreateTable
CREATE TABLE "GoogleDataImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "GoogleDataImportStatus" NOT NULL DEFAULT 'pending',
    "requestedScopes" JSONB NOT NULL,
    "consentType" "GoogleDataImportConsentType" NOT NULL DEFAULT 'one_time',
    "archiveJobId" TEXT,
    "archiveState" TEXT,
    "archiveUrls" JSONB,
    "oauthAccessTokenEncrypted" TEXT,
    "oauthRefreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GoogleDataImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleDataImportItem" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "resourceGroup" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "rawTitle" TEXT,
    "rawUrl" TEXT,
    "rawPayload" JSONB NOT NULL,
    "mappedPlaceId" TEXT,
    "kind" "GoogleDataImportItemKind" NOT NULL,
    "confidence" "GoogleDataImportItemConfidence" NOT NULL,
    "status" "GoogleDataImportItemStatus" NOT NULL DEFAULT 'parsed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleDataImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoogleDataImport_userId_createdAt_idx" ON "GoogleDataImport"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "GoogleDataImport_status_updatedAt_idx" ON "GoogleDataImport"("status", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleDataImportItem_importId_resourceGroup_sourceKey_key" ON "GoogleDataImportItem"("importId", "resourceGroup", "sourceKey");

-- CreateIndex
CREATE INDEX "GoogleDataImportItem_importId_status_idx" ON "GoogleDataImportItem"("importId", "status");

-- CreateIndex
CREATE INDEX "GoogleDataImportItem_mappedPlaceId_idx" ON "GoogleDataImportItem"("mappedPlaceId");

-- AddForeignKey
ALTER TABLE "GoogleDataImport"
ADD CONSTRAINT "GoogleDataImport_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleDataImportItem"
ADD CONSTRAINT "GoogleDataImportItem_importId_fkey"
FOREIGN KEY ("importId") REFERENCES "GoogleDataImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleDataImportItem"
ADD CONSTRAINT "GoogleDataImportItem_mappedPlaceId_fkey"
FOREIGN KEY ("mappedPlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;
