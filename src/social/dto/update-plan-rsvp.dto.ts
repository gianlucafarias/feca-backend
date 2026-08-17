import { IsIn } from "class-validator";

export class UpdatePlanRsvpDto {
  @IsIn(["going", "maybe", "declined", "none"])
  rsvp!: "going" | "maybe" | "declined" | "none";
}
