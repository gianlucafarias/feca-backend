import type { LoggerService } from "@nestjs/common";

import { getRequestContext } from "../request-context/request-context.storage";

export type StructuredLogLevel = "debug" | "info" | "warn" | "error";

export type StructuredLogFields = Record<string, unknown>;

const SERVICE_NAME = "feca-backend";

export function writeStructuredLog(
  level: StructuredLogLevel,
  message: string,
  fields: StructuredLogFields = {},
) {
  const context = getRequestContext();
  const payload = {
    level,
    time: new Date().toISOString(),
    service: SERVICE_NAME,
    msg: message,
    ...(context
      ? {
          requestId: context.requestId,
          method: context.method,
          path: context.path,
        }
      : {}),
    ...fields,
  };

  const line = JSON.stringify(payload);

  switch (level) {
    case "debug":
      console.debug(line);
      break;
    case "info":
      console.log(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "error":
      console.error(line);
      break;
    default: {
      const unexpected: never = level;
      console.log(JSON.stringify({ ...payload, level: unexpected }));
    }
  }
}

export class StructuredLogger implements LoggerService {
  log(message: unknown, context?: string) {
    writeStructuredLog("info", formatNestMessage(message), {
      context,
    });
  }

  error(message: unknown, trace?: string, context?: string) {
    writeStructuredLog("error", formatNestMessage(message), {
      context,
      ...(trace ? { trace } : {}),
    });
  }

  warn(message: unknown, context?: string) {
    writeStructuredLog("warn", formatNestMessage(message), {
      context,
    });
  }

  debug(message: unknown, context?: string) {
    writeStructuredLog("debug", formatNestMessage(message), {
      context,
    });
  }

  verbose(message: unknown, context?: string) {
    writeStructuredLog("debug", formatNestMessage(message), {
      context,
    });
  }
}

function formatNestMessage(message: unknown) {
  if (typeof message === "string") {
    return message;
  }

  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

export function shouldUseStructuredLogger(nodeEnv: string) {
  return nodeEnv === "production";
}
