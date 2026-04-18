import "reflect-metadata";

import {
  Logger,
  UnprocessableEntityException,
  ValidationPipe,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { AppConfigService } from "./config/app-config.service";

function createCorsOriginMatcher(allowedOrigins: string[]) {
  if (allowedOrigins.length === 0) {
    return true;
  }

  return (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.enableShutdownHooks();

  const config = app.get(AppConfigService);

  if (config.trustProxy) {
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
  }

  app.enableCors({
    origin: createCorsOriginMatcher(config.corsAllowedOrigins),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: (errors) =>
        new UnprocessableEntityException({
          details: errors,
          message: "Request validation failed",
        }),
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(config.port);

  new Logger("Bootstrap").log(`FECA backend listening on port ${config.port}`);
}

void bootstrap();
