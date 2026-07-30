import { randomUUID } from "node:crypto";

import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

import { getSafeRequestPath } from "../http/safe-request-path";
import { requestContextStorage } from "./request-context.storage";

const REQUEST_ID_HEADER = "x-request-id";

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.header(REQUEST_ID_HEADER);
    const normalizedRequestId = incoming?.trim();
    const requestId =
      normalizedRequestId &&
      normalizedRequestId.length <= 128 &&
      /^[A-Za-z0-9._:-]+$/u.test(normalizedRequestId)
        ? normalizedRequestId
        : randomUUID();

    res.setHeader("X-Request-Id", requestId);

    requestContextStorage.run(
      {
        requestId,
        method: req.method,
        path: getSafeRequestPath(req),
        startedAt: Date.now(),
      },
      () => next(),
    );
  }
}
