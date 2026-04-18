import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsString,
} from "class-validator";

export class AddGroupMembersDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  memberIds!: string[];
}
