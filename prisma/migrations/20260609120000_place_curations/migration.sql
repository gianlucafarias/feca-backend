-- CreateTable
CREATE TABLE "PlaceCuration" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "cityId" TEXT,
    "boostScore" INTEGER NOT NULL DEFAULT 0,
    "isCityPick" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceCuration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlaceCuration_cityId_isCityPick_active_idx" ON "PlaceCuration"("cityId", "isCityPick", "active");

-- CreateIndex
CREATE INDEX "PlaceCuration_placeId_active_idx" ON "PlaceCuration"("placeId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceCuration_placeId_cityId_key" ON "PlaceCuration"("placeId", "cityId");

-- AddForeignKey
ALTER TABLE "PlaceCuration" ADD CONSTRAINT "PlaceCuration_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceCuration" ADD CONSTRAINT "PlaceCuration_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceCuration" ADD CONSTRAINT "PlaceCuration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
