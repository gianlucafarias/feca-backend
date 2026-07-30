import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable } from "rxjs";
import { finalize, tap } from "rxjs/operators";

import { getSafeRequestPath } from "../http/safe-request-path";
import { writeStructuredLog } from "../logging/structured-logger";
import { getRequestContext } from "../request-context/request-context.storage";
import { HttpMetricsService } from "./http-metrics.service";

const HEALTH_PATH_PREFIXES = ["/health", "/health/live", "/health/ready"];

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly httpMetrics: HttpMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const path = getSafeRequestPath(request);
    let recorded = false;
    let errorStatusCode: number | undefined;

    const recordOnce = () => {
      if (recorded) {
        return;
      }
      recorded = true;
      this.recordRequest(
        request,
        response,
        startedAt,
        path,
        errorStatusCode,
      );
    };

    return next.handle().pipe(
      tap({
        error: (error: unknown) => {
          errorStatusCode =
            error instanceof HttpException ? error.getStatus() : 500;
        },
      }),
      finalize(() => recordOnce()),
    );
  }

  private recordRequest(
    request: Request,
    response: Response,
    startedAt: number,
    path: string,
    errorStatusCode?: number,
  ) {
    if (this.shouldSkip(path)) {
      return;
    }

    const durationMs = Date.now() - startedAt;
    const route = normalizeRoute(request);
    const statusCode = errorStatusCode ?? response.statusCode ?? 500;
    const method = request.method;

    this.httpMetrics.record({
      method,
      route,
      statusCode,
      durationMs,
    });

    const requestContext = getRequestContext();
    writeStructuredLog("info", "http_request_completed", {
      requestId: requestContext?.requestId,
      method,
      path,
      route,
      statusCode,
      durationMs,
    });
  }

  private shouldSkip(path: string) {
    const pathname = path.split("?")[0] ?? path;
    return HEALTH_PATH_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }
}

function normalizeRoute(request: Request) {
  if (typeof request.route?.path === "string") {
    const basePath = request.baseUrl ?? "";
    return `${basePath}${request.route.path}` || request.route.path;
  }

  return request.path || "unknown";
}
