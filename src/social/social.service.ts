import { Injectable } from "@nestjs/common";

import { PaginationQueryDto } from "../common/dto/pagination-query.dto";
import { AddGroupMembersDto } from "./dto/add-group-members.dto";
import { AddDiaryPlaceDto } from "./dto/add-diary-place.dto";
import { AddGroupEventDto } from "./dto/add-group-event.dto";
import { CreateDiaryDto } from "./dto/create-diary.dto";
import { CreateGroupDto } from "./dto/create-group.dto";
import { FeedQueryDto } from "./dto/feed-query.dto";
import { JoinGroupDto } from "./dto/join-group.dto";
import { SearchUsersQueryDto } from "./dto/search-users.query.dto";
import { SuggestedOnboardingUsersQueryDto } from "./dto/suggested-onboarding-users.query.dto";
import { SearchDiariesQueryDto } from "./dto/search-diaries.query.dto";
import { UpdateDiaryDto } from "./dto/update-diary.dto";
import { UpdateGroupDto } from "./dto/update-group.dto";
import { UpdateGroupEventRsvpDto } from "./dto/update-group-event-rsvp.dto";
import { UpdateSocialSettingsDto } from "./dto/update-social-settings.dto";
import { UpdateTasteDto } from "./dto/update-taste.dto";
import { SocialDiariesService } from "./social-diaries.service";
import { SocialFeedService } from "./social-feed.service";
import { SocialGroupsService } from "./social-groups.service";
import { SocialSavesService } from "./social-saves.service";
import { SocialUsersService } from "./social-users.service";

@Injectable()
export class SocialService {
  constructor(
    private readonly feedService: SocialFeedService,
    private readonly usersService: SocialUsersService,
    private readonly savesService: SocialSavesService,
    private readonly groupsService: SocialGroupsService,
    private readonly diariesService: SocialDiariesService,
  ) {}

  getFeed(userId: string, query: FeedQueryDto, origin?: string) {
    return this.feedService.getFeed(userId, query, origin);
  }

  getMyVisits(userId: string, query: PaginationQueryDto) {
    return this.usersService.getMyVisits(userId, query);
  }

  getUserVisits(viewerId: string, userId: string, query: PaginationQueryDto) {
    return this.usersService.getUserVisits(viewerId, userId, query);
  }

  getUserProfile(viewerId: string, userId: string) {
    return this.usersService.getUserProfile(viewerId, userId);
  }

  searchUsers(userId: string, query: SearchUsersQueryDto) {
    return this.usersService.searchUsers(userId, query);
  }

  listSuggestedOnboardingUsers(
    userId: string,
    query: SuggestedOnboardingUsersQueryDto,
  ) {
    return this.usersService.listSuggestedOnboardingUsers(userId, query);
  }

  followUser(userId: string, targetUserId: string) {
    return this.usersService.followUser(userId, targetUserId);
  }

  unfollowUser(userId: string, targetUserId: string) {
    return this.usersService.unfollowUser(userId, targetUserId);
  }

  listFollowing(userId: string, query: PaginationQueryDto) {
    return this.usersService.listFollowing(userId, query);
  }

  listFollowers(userId: string, query: PaginationQueryDto) {
    return this.usersService.listFollowers(userId, query);
  }

  getSocialSettings(userId: string) {
    return this.usersService.getSocialSettings(userId);
  }

  updateSocialSettings(userId: string, body: UpdateSocialSettingsDto) {
    return this.usersService.updateSocialSettings(userId, body);
  }

  getTasteOptions() {
    return this.usersService.getTasteOptions();
  }

  getMyTaste(userId: string) {
    return this.usersService.getMyTaste(userId);
  }

  updateMyTaste(userId: string, body: UpdateTasteDto) {
    return this.usersService.updateMyTaste(userId, body);
  }

  getUserTaste(viewerId: string, userId: string) {
    return this.usersService.getUserTaste(viewerId, userId);
  }

  listSavedPlaces(userId: string, query: PaginationQueryDto) {
    return this.savesService.listSavedPlaces(userId, query);
  }

  getPlaceSaved(userId: string, googlePlaceId: string) {
    return this.savesService.getPlaceSaved(userId, googlePlaceId);
  }

  savePlace(userId: string, googlePlaceId: string) {
    return this.savesService.savePlace(userId, googlePlaceId);
  }

  unsavePlace(userId: string, googlePlaceId: string) {
    return this.savesService.unsavePlace(userId, googlePlaceId);
  }

  listMyGroups(userId: string) {
    return this.groupsService.listMyGroups(userId);
  }

  createGroup(userId: string, body: CreateGroupDto) {
    return this.groupsService.createGroup(userId, body);
  }

  joinGroupByCode(userId: string, body: JoinGroupDto) {
    return this.groupsService.joinGroupByCode(userId, body);
  }

  getGroup(userId: string, groupId: string) {
    return this.groupsService.getGroup(userId, groupId);
  }

  addGroupMembers(userId: string, groupId: string, body: AddGroupMembersDto) {
    return this.groupsService.addGroupMembers(userId, groupId, body);
  }

  updateGroup(userId: string, groupId: string, body: UpdateGroupDto) {
    return this.groupsService.updateGroup(userId, groupId, body);
  }

  leaveGroup(userId: string, groupId: string) {
    return this.groupsService.leaveGroup(userId, groupId);
  }

  listPublicFriendGroupPlans(userId: string, query: PaginationQueryDto) {
    return this.groupsService.listPublicFriendGroupPlans(userId, query);
  }

  addGroupEvent(userId: string, groupId: string, body: AddGroupEventDto) {
    return this.groupsService.addGroupEvent(userId, groupId, body);
  }

  setGroupEventRsvp(
    userId: string,
    groupId: string,
    eventId: string,
    body: UpdateGroupEventRsvpDto,
  ) {
    return this.groupsService.setGroupEventRsvp(userId, groupId, eventId, body);
  }

  listMyDiaries(userId: string) {
    return this.diariesService.listMyDiaries(userId);
  }

  searchPublicDiaries(userId: string, query: SearchDiariesQueryDto) {
    return this.diariesService.searchPublicDiaries(userId, query);
  }

  listUserDiaries(viewerId: string, userId: string) {
    return this.diariesService.listUserDiaries(viewerId, userId);
  }

  createDiary(userId: string, body: CreateDiaryDto) {
    return this.diariesService.createDiary(userId, body);
  }

  listHomeEditorGuides(limit: number) {
    return this.diariesService.listHomeEditorGuides(limit);
  }

  getDiary(viewerId: string, diaryId: string) {
    return this.diariesService.getDiary(viewerId, diaryId);
  }

  addPlaceToDiary(
    userId: string,
    diaryId: string,
    body: AddDiaryPlaceDto,
    origin?: string,
  ) {
    return this.diariesService.addPlaceToDiary(userId, diaryId, body, origin);
  }

  updateDiary(userId: string, diaryId: string, body: UpdateDiaryDto) {
    return this.diariesService.updateDiary(userId, diaryId, body);
  }
}
