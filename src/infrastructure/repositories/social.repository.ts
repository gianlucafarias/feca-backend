import { Injectable } from "@nestjs/common";
import {
  GroupEventStatus,
  GroupVisibility,
  MemberProposalInteraction,
  PlaceProposalPolicy,
  Prisma,
} from "@prisma/client";

import { SocialDiariesRepository } from "./social/social-diaries.repository";
import { SocialFeedRepository } from "./social/social-feed.repository";
import { SocialGraphRepository } from "./social/social-graph.repository";
import { SocialGroupsRepository } from "./social/social-groups.repository";
import { SocialPlaceContextRepository } from "./social/social-place-context.repository";
import { SocialRepositorySupport } from "./social/social.repository.support";
import {
  type FeedInput,
  type PaginationInput,
  type SocialSettingsView,
} from "./social/social.repository.types";
import { SocialVisitsRepository } from "./social/social-visits.repository";

@Injectable()
export class SocialRepository {
  constructor(
    private readonly support: SocialRepositorySupport,
    private readonly feedRepository: SocialFeedRepository,
    private readonly graphRepository: SocialGraphRepository,
    private readonly visitsRepository: SocialVisitsRepository,
    private readonly groupsRepository: SocialGroupsRepository,
    private readonly diariesRepository: SocialDiariesRepository,
    private readonly placeContextRepository: SocialPlaceContextRepository,
  ) {}

  // — graph —
  findUserByIdWithStats(userId: string) {
    return this.graphRepository.findUserByIdWithStats(userId);
  }
  findUserByIdWithContext(viewerId: string, userId: string) {
    return this.graphRepository.findUserByIdWithContext(viewerId, userId);
  }
  searchUsers(viewerId: string, input: PaginationInput & { q?: string }) {
    return this.graphRepository.searchUsers(viewerId, input);
  }
  listSuggestedOnboardingUsers(
    viewerId: string,
    options: { limit: number; cityGooglePlaceId?: string | null },
  ) {
    return this.graphRepository.listSuggestedOnboardingUsers(viewerId, options);
  }
  getUserPlaceCreationContext(userId: string) {
    return this.graphRepository.getUserPlaceCreationContext(userId);
  }
  followUser(viewerId: string, targetUserId: string) {
    return this.graphRepository.followUser(viewerId, targetUserId);
  }
  unfollowUser(viewerId: string, targetUserId: string) {
    return this.graphRepository.unfollowUser(viewerId, targetUserId);
  }
  listFollowing(userId: string, input: PaginationInput) {
    return this.graphRepository.listFollowing(userId, input);
  }
  listFollowers(userId: string, input: PaginationInput) {
    return this.graphRepository.listFollowers(userId, input);
  }
  getSocialSettings(userId: string) {
    return this.graphRepository.getSocialSettings(userId);
  }
  updateSocialSettings(userId: string, input: Partial<SocialSettingsView>) {
    return this.graphRepository.updateSocialSettings(userId, input);
  }
  getProfileStats(userId: string) {
    return this.graphRepository.getProfileStats(userId);
  }
  getUserTastePreferenceIds(userId: string) {
    return this.graphRepository.getUserTastePreferenceIds(userId);
  }
  getUserCityId(userId: string) {
    return this.graphRepository.getUserCityId(userId);
  }
  updateUserTastePreferenceIds(userId: string, tastePreferenceIds: string[]) {
    return this.graphRepository.updateUserTastePreferenceIds(userId, tastePreferenceIds);
  }
  viewerFollowsUser(viewerId: string, targetUserId: string) {
    return this.graphRepository.viewerFollowsUser(viewerId, targetUserId);
  }
  listFollowedUserIds(viewerId: string) {
    return this.graphRepository.listFollowedUserIds(viewerId);
  }
  listFollowerIds(userId: string) {
    return this.graphRepository.listFollowerIds(userId);
  }

  // — feed —
  getUserRecommendationSignals(userId: string) {
    return this.feedRepository.getUserRecommendationSignals(userId);
  }
  listFeed(userId: string, input: FeedInput) {
    return this.feedRepository.listFeed(userId, input);
  }

  // — visits & saves —
  createVisit(input: Parameters<SocialVisitsRepository["createVisit"]>[0]) {
    return this.visitsRepository.createVisit(input);
  }
  listVisitsByUser(userId: string, input: PaginationInput) {
    return this.visitsRepository.listVisitsByUser(userId, input);
  }
  listSavedPlaces(userId: string, input: PaginationInput) {
    return this.visitsRepository.listSavedPlaces(userId, input);
  }
  isPlaceSaved(userId: string, placeId: string) {
    return this.visitsRepository.isPlaceSaved(userId, placeId);
  }
  savePlace(userId: string, placeId: string, reason?: string) {
    return this.visitsRepository.savePlace(userId, placeId, reason);
  }
  unsavePlace(userId: string, placeId: string) {
    return this.visitsRepository.unsavePlace(userId, placeId);
  }
  listRecentlyInteractedPlaceRouteIds(userId: string, since: Date) {
    return this.visitsRepository.listRecentlyInteractedPlaceRouteIds(userId, since);
  }

  // — groups —
  listGroupsByUser(userId: string) {
    return this.groupsRepository.listGroupsByUser(userId);
  }
  createGroup(input: Parameters<SocialGroupsRepository["createGroup"]>[0]) {
    return this.groupsRepository.createGroup(input);
  }
  addGroupMembers(input: Parameters<SocialGroupsRepository["addGroupMembers"]>[0]) {
    return this.groupsRepository.addGroupMembers(input);
  }
  findGroupById(groupId: string) {
    return this.groupsRepository.findGroupById(groupId);
  }
  findGroupByInviteCode(inviteCode: string) {
    return this.groupsRepository.findGroupByInviteCode(inviteCode);
  }
  findGroupMembership(groupId: string, userId: string) {
    return this.groupsRepository.findGroupMembership(groupId, userId);
  }
  joinGroupByCode(userId: string, inviteCode: string) {
    return this.groupsRepository.joinGroupByCode(userId, inviteCode);
  }
  findGroupEventById(groupId: string, eventId: string) {
    return this.groupsRepository.findGroupEventById(groupId, eventId);
  }
  createGroupEvent(input: {
    date: string;
    groupId: string;
    placeId: string;
    proposedById: string;
    status?: GroupEventStatus;
  }) {
    return this.groupsRepository.createGroupEvent(input);
  }
  updateGroup(input: {
    groupId: string;
    memberProposalInteraction?: MemberProposalInteraction;
    name?: string;
    placeProposalPolicy?: PlaceProposalPolicy;
    visibility?: GroupVisibility;
  }) {
    return this.groupsRepository.updateGroup(input);
  }
  leaveGroup(groupId: string, userId: string) {
    return this.groupsRepository.leaveGroup(groupId, userId);
  }
  listPublicFriendGroupPlanCandidates(input: {
    excludeMember: boolean;
    viewerId: string;
  }) {
    return this.groupsRepository.listPublicFriendGroupPlanCandidates(input);
  }
  setGroupEventRsvp(input: Parameters<SocialGroupsRepository["setGroupEventRsvp"]>[0]) {
    return this.groupsRepository.setGroupEventRsvp(input);
  }

  // — diaries —
  listDiariesByUser(userId: string) {
    return this.diariesRepository.listDiariesByUser(userId);
  }
  createDiary(input: Parameters<SocialDiariesRepository["createDiary"]>[0]) {
    return this.diariesRepository.createDiary(input);
  }
  listHomeEditorGuides(viewerId: string, limit: number) {
    return this.diariesRepository.listHomeEditorGuides(viewerId, limit);
  }
  patchDiary(diaryId: string, data: Prisma.DiaryUpdateInput) {
    return this.diariesRepository.patchDiary(diaryId, data);
  }
  searchPublicDiaries(
    input: PaginationInput & { q: string; viewerId: string },
  ) {
    return this.diariesRepository.searchPublicDiaries(input);
  }
  findDiaryById(diaryId: string) {
    return this.diariesRepository.findDiaryById(diaryId);
  }
  addPlaceToDiary(
    diaryId: string,
    placeId: string,
    input?: { note?: string; position?: number },
  ) {
    return this.diariesRepository.addPlaceToDiary(diaryId, placeId, input);
  }

  // — place context —
  getNearbyNetworkSignalsForGooglePlaces(viewerId: string, googlePlaceIds: string[]) {
    return this.placeContextRepository.getNearbyNetworkSignalsForGooglePlaces(
      viewerId,
      googlePlaceIds,
    );
  }
  getViewerRadarVisitOverlay(viewerId: string, googlePlaceIds: string[]) {
    return this.placeContextRepository.getViewerRadarVisitOverlay(viewerId, googlePlaceIds);
  }
  listNearbyNetworkChipsByGooglePlaceIds(viewerId: string, googlePlaceIds: string[]) {
    return this.placeContextRepository.listNearbyNetworkChipsByGooglePlaceIds(
      viewerId,
      googlePlaceIds,
    );
  }
  getPlaceSocialContext(viewerId: string, placeId: string) {
    return this.placeContextRepository.getPlaceSocialContext(viewerId, placeId);
  }

  // — support —
  getUserCoordinates(userId: string) {
    return this.support.getUserCoordinates(userId);
  }
}
