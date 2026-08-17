import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { GroupJoinPolicy, GroupVisibility } from "@prisma/client";

export class CreatePlanDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(GroupJoinPolicy)
  joinPolicy: GroupJoinPolicy = GroupJoinPolicy.open;

  @IsOptional()
  @IsEnum(GroupVisibility)
  visibility: GroupVisibility = GroupVisibility.public;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  inviteUserIds?: string[];

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  placeId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  googlePlaceId?: string;
}
