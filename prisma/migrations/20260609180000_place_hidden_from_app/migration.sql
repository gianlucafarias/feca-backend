-- AlterTable
ALTER TABLE "Place" ADD COLUMN "hiddenFromApp" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Place_hiddenFromApp_idx" ON "Place"("hiddenFromApp");
