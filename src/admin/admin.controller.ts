import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import type { AccessTokenPayload } from "../auth/auth.types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AccessTokenGuard } from "../common/guards/access-token.guard";
import { AdminGuard } from "../common/guards/admin.guard";
import { AdminService } from "./admin.service";
import { CreatePlaceCurationDto } from "./dto/create-place-curation.dto";
import { ListPlaceCurationsQueryDto } from "./dto/list-place-curations.query.dto";
import { SetPlaceVisibilityDto } from "./dto/set-place-visibility.dto";
import { UpdatePlaceCurationDto } from "./dto/update-place-curation.dto";

@Controller("v1/admin")
@UseGuards(AccessTokenGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("cities")
  listCities() {
    return this.adminService.listCities();
  }

  @Get("curations")
  listCurations(@Query() query: ListPlaceCurationsQueryDto) {
    return this.adminService.listCurations(
      query.cityId,
      query.cityGooglePlaceId,
    );
  }

  @Post("curations")
  createCuration(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreatePlaceCurationDto,
  ) {
    return this.adminService.createCuration(user.sub, body);
  }

  @Patch("curations/:id")
  updateCuration(
    @Param("id") id: string,
    @Body() body: UpdatePlaceCurationDto,
  ) {
    return this.adminService.updateCuration(id, body);
  }

  @Delete("curations/:id")
  deleteCuration(@Param("id") id: string) {
    return this.adminService.deleteCuration(id);
  }

  @Patch("places/visibility")
  setPlaceVisibility(@Body() body: SetPlaceVisibilityDto) {
    return this.adminService.setPlaceVisibility(body);
  }
}
