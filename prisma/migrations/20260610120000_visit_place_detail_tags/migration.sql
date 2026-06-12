-- AlterTable
ALTER TABLE "Visit"
ADD COLUMN "placeDetailTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "hasParking" BOOLEAN,
ADD COLUMN "petFriendly" BOOLEAN;

-- CreateTable
CREATE TABLE "UserVisitPlaceTag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserVisitPlaceTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPlaceVisitDetailTag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPlaceVisitDetailTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserVisitPlaceTag_userId_updatedAt_idx" ON "UserVisitPlaceTag"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UserVisitPlaceTag_userId_label_key" ON "UserVisitPlaceTag"("userId", "label");

-- CreateIndex
CREATE INDEX "UserPlaceVisitDetailTag_userId_placeId_updatedAt_idx" ON "UserPlaceVisitDetailTag"("userId", "placeId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UserPlaceVisitDetailTag_userId_placeId_label_key" ON "UserPlaceVisitDetailTag"("userId", "placeId", "label");

-- AddForeignKey
ALTER TABLE "UserVisitPlaceTag" ADD CONSTRAINT "UserVisitPlaceTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlaceVisitDetailTag" ADD CONSTRAINT "UserPlaceVisitDetailTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlaceVisitDetailTag" ADD CONSTRAINT "UserPlaceVisitDetailTag_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
