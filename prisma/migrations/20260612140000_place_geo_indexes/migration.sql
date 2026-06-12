-- Geo pre-filter indexes for nearby bounding-box queries
CREATE INDEX "Place_hiddenFromApp_lat_lng_idx" ON "Place"("hiddenFromApp", "lat", "lng");

-- Feed / taste signal queries ordered by visit date
CREATE INDEX "Visit_userId_visitedAt_idx" ON "Visit"("userId", "visitedAt" DESC);
