import { Transform } from "class-transformer";
import { IsIn, IsString, MaxLength } from "class-validator";

function normalizeRequiredText(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  return value.trim();
}

export class UpsertPushTokenDto {
  @Transform(({ value }) => normalizeRequiredText(value))
  @IsString()
  @MaxLength(255)
  token!: string;

  @Transform(({ value }) => normalizeRequiredText(value))
  @IsIn(["expo"])
  provider!: "expo";

  @Transform(({ value }) => normalizeRequiredText(value))
  @IsString()
  @MaxLength(128)
  installationId!: string;

  @Transform(({ value }) => normalizeRequiredText(value))
  @IsIn(["ios", "android"])
  platform!: "ios" | "android";

  @Transform(({ value }) => normalizeRequiredText(value))
  @IsString()
  @MaxLength(128)
  timezone!: string;
}
