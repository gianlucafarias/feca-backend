-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isEditor" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "User_isEditor_idx" ON "User"("isEditor");

-- AlterTable
ALTER TABLE "Diary" ADD COLUMN     "featuredCityId" TEXT;

-- CreateIndex
CREATE INDEX "Diary_featuredCityId_idx" ON "Diary"("featuredCityId");

-- AddForeignKey
ALTER TABLE "Diary" ADD CONSTRAINT "Diary_featuredCityId_fkey" FOREIGN KEY ("featuredCityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
