import { IsIn, IsString, MinLength } from "class-validator";

export class ResolvePlaceDto {
  @IsString()
  @IsIn(["google"])
  source!: "google";

  @IsString()
  @MinLength(1)
  sourcePlaceId!: string;
}

