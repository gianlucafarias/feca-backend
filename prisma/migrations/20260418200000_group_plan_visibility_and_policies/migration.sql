-- CreateEnum
CREATE TYPE "GroupVisibility" AS ENUM ('private', 'public_followers');

-- CreateEnum
CREATE TYPE "PlaceProposalPolicy" AS ENUM ('all_members', 'owner_only');

-- CreateEnum
CREATE TYPE "MemberProposalInteraction" AS ENUM ('collaborative', 'announcement_locked');

-- AlterEnum
ALTER TYPE "GroupEventStatus" ADD VALUE 'announcement';

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "visibility" "GroupVisibility" NOT NULL DEFAULT 'private',
ADD COLUMN     "placeProposalPolicy" "PlaceProposalPolicy" NOT NULL DEFAULT 'all_members',
ADD COLUMN     "memberProposalInteraction" "MemberProposalInteraction" NOT NULL DEFAULT 'collaborative';

-- CreateIndex
CREATE INDEX "Group_visibility_createdAt_idx" ON "Group"("visibility", "createdAt" DESC);
