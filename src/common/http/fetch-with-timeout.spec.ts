import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchWithTimeout,
  UpstreamTimeoutError,
} from "./fetch-with-timeout";

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("aborts an upstream request after the configured deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: unknown, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      ),
    );

    const request = fetchWithTimeout("https://example.com", {}, 50);
    const assertion = expect(request).rejects.toBeInstanceOf(
      UpstreamTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(50);

    await assertion;
  });

  it("preserves caller cancellation", async () => {
    const caller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: unknown, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      ),
    );

    const request = fetchWithTimeout(
      "https://example.com",
      { signal: caller.signal },
      5_000,
    );
    caller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});
