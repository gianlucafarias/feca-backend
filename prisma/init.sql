CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "PlaceSource" AS ENUM ('google', 'manual');

CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "source" "PlaceSource" NOT NULL,
    "sourcePlaceId" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "categories" TEXT[],
    "ratingExternal" DOUBLE PRECISION,
    "ratingCountExternal" INTEGER,
    "phone" TEXT,
    "website" TEXT,
    "openingHours" TEXT[],
    "googleMapsUri" TEXT,
    "coverPhotoRef" TEXT,
    "coverPhotoUrl" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Place_sourcePlaceId_key" ON "Place"("sourcePlaceId");
CREATE INDEX "Place_city_idx" ON "Place"("city");
CREATE INDEX "Place_name_idx" ON "Place"("name");
CREATE INDEX "Visit_placeId_createdAt_idx" ON "Visit"("placeId", "createdAt" DESC);

ALTER TABLE "Visit"
ADD CONSTRAINT "Visit_placeId_fkey"
FOREIGN KEY ("placeId")
REFERENCES "Place"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
