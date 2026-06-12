-- AlterTable
ALTER TABLE "PlaceCuration" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PlaceCuration_expiresAt_idx" ON "PlaceCuration"("expiresAt");
