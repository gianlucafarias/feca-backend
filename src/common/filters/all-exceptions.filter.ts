import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request } from "express";
import { randomUUID } from "node:crypto";

import { getSafeRequestPath } from "../http/safe-request-path";
import { writeStructuredLog } from "../logging/structured-logger";
import { getRequestContext } from "../request-context/request-context.storage";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse();
    const request = context.getRequest<Request>();
    const path = getSafeRequestPath(request);
    const nodeEnv = process.env.NODE_ENV ?? "development";
    const requestId = getRequestContext()?.requestId ?? randomUUID();
    response.setHeader("X-Request-Id", requestId);

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const normalized =
        typeof exceptionResponse === "object" && exceptionResponse !== null
          ? exceptionResponse
          : { message: exceptionResponse };

      const rawMessage =
        typeof normalized === "object" &&
        normalized !== null &&
        "message" in normalized
          ? normalized.message
          : "Request failed";
      const message = sanitizeHttpMessage(rawMessage, {
        method: request.method,
        path,
        requestUrl: request.url,
        status,
      });

      if (status >= 500) {
        this.logHttpError({
          exception,
          requestId,
          path,
          statusCode: status,
          nodeEnv,
        });

        return response.status(status).json({
          message:
            "El servicio no está disponible en este momento. Inténtalo de nuevo más tarde.",
          statusCode: status,
          path,
          timestamp: new Date().toISOString(),
          requestId,
        });
      }

      return response.status(status).json({
        ...(typeof normalized === "object" && normalized !== null ? normalized : {}),
        message,
        statusCode: status,
        path,
        timestamp: new Date().toISOString(),
        requestId,
      });
    }

    this.logHttpError({
      exception,
      requestId,
      path,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      nodeEnv,
    });

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message:
        "El servicio no está disponible en este momento. Inténtalo de nuevo más tarde.",
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      path,
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  private logHttpError(input: {
    exception: unknown;
    path: string;
    requestId: string;
    statusCode: number;
    nodeEnv: string;
  }) {
    const requestContext = getRequestContext();
    const durationMs = requestContext
      ? Date.now() - requestContext.startedAt
      : undefined;

    writeStructuredLog("error", "http_request_failed", {
      requestId: input.requestId,
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

export function sanitizeHttpMessage(
  message: unknown,
  request: {
    method: string;
    path: string;
    requestUrl: string;
    status: number;
  },
): unknown {
  if (Array.isArray(message)) {
    return message.map((entry) => sanitizeHttpMessage(entry, request));
  }

  if (typeof message !== "string") {
    return message;
  }

  if (
    request.status === HttpStatus.NOT_FOUND &&
    message.startsWith(`Cannot ${request.method} `)
  ) {
    return `Cannot ${request.method} ${request.path}`;
  }

  return request.requestUrl && request.requestUrl !== request.path
    ? message.replaceAll(request.requestUrl, request.path)
    : message;
}
