import { Global, Module } from "@nestjs/common";

import { AppConfigModule } from "../../config/app-config.module";
import { QueueService } from "./queue.service";

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
