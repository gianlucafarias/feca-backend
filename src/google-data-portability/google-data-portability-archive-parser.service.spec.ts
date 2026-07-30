import { BadGatewayException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GoogleDataPortabilityArchiveParserService } from "./google-data-portability-archive-parser.service";

describe("GoogleDataPortabilityArchiveParserService", () => {
  const service = new GoogleDataPortabilityArchiveParserService();

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects non-HTTPS archive URLs before fetching them", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      service.downloadJsonDocuments(["http://127.0.0.1/archive.json"]),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a declared archive larger than the per-file limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{}", {
          headers: {
            "content-length": String(30 * 1024 * 1024),
          },
        }),
      ),
    );

    await expect(
      service.downloadJsonDocuments([
        "https://storage.googleapis.com/feca/archive.json",
      ]),
    ).rejects.toThrow("Google data archive is too large");
  });

  it("parses a bounded JSON archive", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"features":[]}', {
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      service.downloadJsonDocuments([
        "https://storage.googleapis.com/feca/archive.json",
      ]),
    ).resolves.toEqual([
      {
        payload: { features: [] },
        source: "https://storage.googleapis.com/feca/archive.json",
      },
    ]);
  });
});
