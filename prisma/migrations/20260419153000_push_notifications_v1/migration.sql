-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'group_invite_reminder';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'group_event_rsvp_reminder';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'group_event_today_reminder';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'weekly_digest';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'contextual_recommendation';

-- AlterEnum
ALTER TYPE "NotificationEntityType" ADD VALUE IF NOT EXISTS 'place';

-- CreateEnum
CREATE TYPE "PushProvider" AS ENUM ('expo');

-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM ('ios', 'android');

-- CreateEnum
CREATE TYPE "PushDeliveryStatus" AS ENUM ('pending', 'ticketed', 'delivered', 'failed', 'cancelled');

-- AlterTable
ALTER TABLE "UserSettings"
ADD COLUMN "pushEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Notification"
ADD COLUMN "dedupeKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateTable
CREATE TABLE "PushInstallation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "PushProvider" NOT NULL,
    "installationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "PushPlatform" NOT NULL,
    "timezone" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "status" "PushDeliveryStatus" NOT NULL DEFAULT 'pending',
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "expoTicketId" TEXT,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushInstallation_provider_installationId_key" ON "PushInstallation"("provider", "installationId");

-- CreateIndex
CREATE INDEX "PushInstallation_userId_lastSeenAt_idx" ON "PushInstallation"("userId", "lastSeenAt" DESC);

-- CreateIndex
CREATE INDEX "PushInstallation_provider_token_idx" ON "PushInstallation"("provider", "token");

-- CreateIndex
CREATE INDEX "PushInstallation_disabledAt_revokedAt_lastSeenAt_idx" ON "PushInstallation"("disabledAt", "revokedAt", "lastSeenAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PushDelivery_notificationId_installationId_key" ON "PushDelivery"("notificationId", "installationId");

-- CreateIndex
CREATE INDEX "PushDelivery_status_scheduledFor_createdAt_idx" ON "PushDelivery"("status", "scheduledFor", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PushDelivery_expoTicketId_idx" ON "PushDelivery"("expoTicketId");

-- CreateIndex
CREATE INDEX "PushDelivery_installationId_createdAt_idx" ON "PushDelivery"("installationId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "PushInstallation"
ADD CONSTRAINT "PushInstallation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDelivery"
ADD CONSTRAINT "PushDelivery_notificationId_fkey"
FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDelivery"
ADD CONSTRAINT "PushDelivery_installationId_fkey"
FOREIGN KEY ("installationId") REFERENCES "PushInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
