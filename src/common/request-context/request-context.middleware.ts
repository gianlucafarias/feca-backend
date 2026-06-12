import { randomUUID } from "node:crypto";

import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

import { requestContextStorage } from "./request-context.storage";

const REQUEST_ID_HEADER = "x-request-id";

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.header(REQUEST_ID_HEADER);
    const requestId =
      typeof incoming === "string" && incoming.trim().length > 0
        ? incoming.trim()
        : randomUUID();

    res.setHeader("X-Request-Id", requestId);

    requestContextStorage.run(
      {
        requestId,
        method: req.method,
        path: req.originalUrl ?? req.url,
        startedAt: Date.now(),
      },
      () => next(),
    );
  }
}
