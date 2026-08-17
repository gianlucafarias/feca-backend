-- New plan facade values. Existing groups keep their legacy visibility and
-- become invite-only so code/invitation semantics do not change.
ALTER TYPE "GroupVisibility" ADD VALUE 'public';
ALTER TYPE "GroupEventStatus" ADD VALUE 'cancelled';
ALTER TYPE "GroupMemberStatus" ADD VALUE 'requested';

CREATE TYPE "GroupJoinPolicy" AS ENUM ('open', 'request_approval', 'invite_only');

ALTER TABLE "Group"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "joinPolicy" "GroupJoinPolicy" NOT NULL DEFAULT 'invite_only';

CREATE INDEX "Group_visibility_joinPolicy_createdAt_idx"
  ON "Group"("visibility", "joinPolicy", "createdAt" DESC);

CREATE TABLE "GroupMessage" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "GroupMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GroupMessage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GroupMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "GroupMessage_groupId_createdAt_id_idx"
  ON "GroupMessage"("groupId", "createdAt" DESC, "id" DESC);
CREATE INDEX "GroupMessage_authorId_createdAt_idx"
  ON "GroupMessage"("authorId", "createdAt" DESC);

ALTER TYPE "NotificationType" ADD VALUE 'group_join_request';
ALTER TYPE "NotificationType" ADD VALUE 'group_join_approved';
ALTER TYPE "NotificationType" ADD VALUE 'group_join_rejected';
ALTER TYPE "NotificationType" ADD VALUE 'group_message';
