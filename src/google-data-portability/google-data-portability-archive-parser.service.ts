import { isIP } from "node:net";
import { inflateRawSync } from "node:zlib";

import { BadGatewayException, Injectable } from "@nestjs/common";

export type GoogleDataArchiveDocument = {
  source: string;
  payload: unknown;
};

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

const MAX_ARCHIVE_URLS = 10;
const MAX_ARCHIVE_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const MAX_ARCHIVE_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 5_000;
const MAX_JSON_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 100 * 1024 * 1024;
const ARCHIVE_DOWNLOAD_TIMEOUT_MS = 30_000;

@Injectable()
export class GoogleDataPortabilityArchiveParserService {
  async downloadJsonDocuments(urls: string[]): Promise<GoogleDataArchiveDocument[]> {
    if (urls.length > MAX_ARCHIVE_URLS) {
      throw new BadGatewayException("Google data archive has too many download URLs");
    }

    const documents: GoogleDataArchiveDocument[] = [];
    let downloadedBytes = 0;

    for (const url of urls) {
      assertSafeArchiveUrl(url);

      const remainingTotalBytes = MAX_ARCHIVE_TOTAL_BYTES - downloadedBytes;
      if (remainingTotalBytes <= 0) {
        throw new BadGatewayException("Google data archive is too large");
      }

      const response = await fetch(url, {
        signal: AbortSignal.timeout(ARCHIVE_DOWNLOAD_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new BadGatewayException("Could not download Google data archive");
      }

      assertSafeArchiveUrl(response.url || url);

      const buffer = await readResponseBodyWithLimit(
        response,
        Math.min(MAX_ARCHIVE_DOWNLOAD_BYTES, remainingTotalBytes),
      );
      downloadedBytes += buffer.length;
      documents.push(...this.parseBuffer(url, buffer));
    }

    return documents;
  }

  private parseBuffer(source: string, buffer: Buffer): GoogleDataArchiveDocument[] {
    if (isZip(buffer)) {
      return this.parseZip(source, buffer);
    }

    const payload = parseJson(buffer.toString("utf8"));
    return payload === undefined ? [] : [{ source, payload }];
  }

  private parseZip(source: string, buffer: Buffer): GoogleDataArchiveDocument[] {
    const entries = readZipEntries(buffer);
    const documents: GoogleDataArchiveDocument[] = [];
    let extractedBytes = 0;

    for (const entry of entries) {
      if (!entry.name.toLowerCase().endsWith(".json")) {
        continue;
      }

      const entryBuffer = readZipEntryBuffer(buffer, entry);
      extractedBytes += entryBuffer.length;
      if (extractedBytes > MAX_EXTRACTED_BYTES) {
        throw new BadGatewayException("Google data archive expands beyond the limit");
      }

      const payload = parseJson(entryBuffer.toString("utf8"));

      if (payload !== undefined) {
        documents.push({
          source: `${source}#${entry.name}`,
          payload,
        });
      }
    }

    return documents;
  }
}

function isZip(buffer: Buffer) {
  return buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50;
}

function parseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset === -1) {
    throw new BadGatewayException("Invalid Google data archive zip");
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  if (entryCount > MAX_ZIP_ENTRIES) {
    throw new BadGatewayException("Google data archive has too many entries");
  }

  let cursor = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < entryCount; i += 1) {
    if (cursor < 0 || cursor + 46 > buffer.length) {
      throw new BadGatewayException("Invalid Google data archive zip directory");
    }

    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new BadGatewayException("Invalid Google data archive zip directory");
    }

    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const entryEnd =
      cursor + 46 + fileNameLength + extraLength + commentLength;
    if (entryEnd > buffer.length) {
      throw new BadGatewayException("Invalid Google data archive zip directory");
    }
    if (
      compressedSize > MAX_ARCHIVE_DOWNLOAD_BYTES ||
      uncompressedSize > MAX_JSON_ENTRY_BYTES
    ) {
      throw new BadGatewayException("Google data archive entry is too large");
    }

    const name = buffer
      .subarray(cursor + 46, cursor + 46 + fileNameLength)
      .toString("utf8");

    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    cursor = entryEnd;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const minOffset = Math.max(0, buffer.length - 65_557);

  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  return -1;
}

function readZipEntryBuffer(buffer: Buffer, entry: ZipEntry) {
  const offset = entry.localHeaderOffset;

  if (offset < 0 || offset + 30 > buffer.length) {
    throw new BadGatewayException("Invalid Google data archive zip entry");
  }

  if (buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new BadGatewayException("Invalid Google data archive zip entry");
  }

  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataStart < 0 || dataEnd > buffer.length) {
    throw new BadGatewayException("Invalid Google data archive zip entry");
  }

  const compressed = buffer.subarray(
    dataStart,
    dataEnd,
  );

  if (entry.method === 0) {
    if (compressed.length > MAX_JSON_ENTRY_BYTES) {
      throw new BadGatewayException("Google data archive entry is too large");
    }
    return compressed;
  }

  if (entry.method === 8) {
    try {
      const inflated = inflateRawSync(compressed, {
        maxOutputLength: MAX_JSON_ENTRY_BYTES,
      });
      if (
        inflated.length > MAX_JSON_ENTRY_BYTES ||
        (entry.uncompressedSize > 0 &&
          inflated.length !== entry.uncompressedSize)
      ) {
        throw new BadGatewayException("Invalid Google data archive zip entry");
      }
      return inflated;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }
      throw new BadGatewayException("Invalid Google data archive zip entry");
    }
  }

  throw new BadGatewayException("Unsupported Google data archive zip compression");
}

async function readResponseBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new BadGatewayException("Google data archive is too large");
  }

  if (!response.body) {
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new BadGatewayException("Google data archive is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

function assertSafeArchiveUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BadGatewayException("Invalid Google data archive URL");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    isLocalOrPrivateHost(parsed.hostname)
  ) {
    throw new BadGatewayException("Invalid Google data archive URL");
  }
}

function isLocalOrPrivateHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    const [a = 0, b = 0] = normalized.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (ipVersion === 6) {
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }

  return false;
}
