import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request } from "express";

import { writeStructuredLog } from "../logging/structured-logger";
import { getRequestContext } from "../request-context/request-context.storage";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse();
    const request = context.getRequest<Request>();
    const path = request.originalUrl ?? request.url;
    const nodeEnv = process.env.NODE_ENV ?? "development";

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const normalized =
        typeof exceptionResponse === "object" && exceptionResponse !== null
          ? exceptionResponse
          : { message: exceptionResponse };

      const message =
        typeof normalized === "object" &&
        normalized !== null &&
        "message" in normalized
          ? normalized.message
          : "Request failed";

      if (status >= 500) {
        this.logHttpError({
          exception,
          path,
          statusCode: status,
          nodeEnv,
        });
      }

      return response.status(status).json({
        ...(typeof normalized === "object" && normalized !== null ? normalized : {}),
        message,
        statusCode: status,
        path,
        timestamp: new Date().toISOString(),
        requestId: getRequestContext()?.requestId,
      });
    }

    this.logHttpError({
      exception,
      path,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      nodeEnv,
    });

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      path,
      timestamp: new Date().toISOString(),
      requestId: getRequestContext()?.requestId,
    });
  }

  private logHttpError(input: {
    exception: unknown;
    path: string;
    statusCode: number;
    nodeEnv: string;
  }) {
    const requestContext = getRequestContext();
    const durationMs = requestContext
      ? Date.now() - requestContext.startedAt
      : undefined;

    writeStructuredLog("error", "http_request_failed", {
      path: input.path,
      statusCode: input.statusCode,
      durationMs,
      ...(input.nodeEnv !== "production" && input.exception instanceof Error
        ? {
            errorName: input.exception.name,
            errorMessage: input.exception.message,
            stack: input.exception.stack,
          }
        : input.exception instanceof Error
          ? {
              errorName: input.exception.name,
              errorMessage: input.exception.message,
            }
          : {
              errorMessage: String(input.exception),
            }),
    });
  }
}
