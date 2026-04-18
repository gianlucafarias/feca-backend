import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import {
  GroupVisibility,
  MemberProposalInteraction,
  PlaceProposalPolicy,
} from "@prisma/client";

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsEnum(GroupVisibility)
  visibility?: GroupVisibility;

  @IsOptional()
  @IsEnum(PlaceProposalPolicy)
  placeProposalPolicy?: PlaceProposalPolicy;

  @IsOptional()
  @IsEnum(MemberProposalInteraction)
  memberProposalInteraction?: MemberProposalInteraction;
}
