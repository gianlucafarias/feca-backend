import { IsString, MinLength } from "class-validator";

export class GoogleMobileAuthDto {
  @IsString()
  @MinLength(1)
  idToken!: string;
}
