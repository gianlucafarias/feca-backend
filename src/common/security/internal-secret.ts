import { timingSafeEqual } from "node:crypto";

import {
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";

export function assertInternalSecret(
  configuredSecret: string | undefined,
  providedSecret: string | undefined,
) {
  const configured = configuredSecret?.trim();

  if (!configured) {
    throw new ServiceUnavailableException(
      "Internal operations secret is not configured",
    );
  }

  if (!providedSecret || !secretsMatch(configured, providedSecret)) {
    throw new UnauthorizedException("Invalid internal operations secret");
  }
}

function secretsMatch(expected: string, actual: string) {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);

  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}
