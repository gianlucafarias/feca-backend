import { IsIn } from "class-validator";

export const GROUP_EVENT_RSVP_VALUES = [
  "going",
  "maybe",
  "declined",
  "none",
] as const;

export type GroupEventRsvpInput = (typeof GROUP_EVENT_RSVP_VALUES)[number];

export class UpdateGroupEventRsvpDto {
  @IsIn(GROUP_EVENT_RSVP_VALUES)
  rsvp!: GroupEventRsvpInput;
}
