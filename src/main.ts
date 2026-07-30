import "reflect-metadata";

import {
  ForbiddenException,
  UnprocessableEntityException,
  ValidationPipe,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";

import { AppModule } from "./app.module";
import {
  shouldUseStructuredLogger,
  StructuredLogger,
  writeStructuredLog,
} from "./common/logging/structured-logger";
import { AppConfigService } from "./config/app-config.service";

function createCorsOriginMatcher(allowedOrigins: string[]) {
  return (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new ForbiddenException("Origin is not allowed by CORS"), false);
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.enableShutdownHooks();

  const config = app.get(AppConfigService);
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  app.use(helmet());

  if (shouldUseStructuredLogger(config.nodeEnv)) {
    app.useLogger(new StructuredLogger());
  }

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
      validationError: {
        target: false,
        value: false,
      },
    }),
  );

  await app.listen(config.port);

  writeStructuredLog("info", "feca_backend_started", {
    port: config.port,
    nodeEnv: config.nodeEnv,
  });
}

void bootstrap();
