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
  localHeaderOffset: number;
};

@Injectable()
export class GoogleDataPortabilityArchiveParserService {
  async downloadJsonDocuments(urls: string[]): Promise<GoogleDataArchiveDocument[]> {
    const documents: GoogleDataArchiveDocument[] = [];

    for (const url of urls) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new BadGatewayException("Could not download Google data archive");
      }

      const buffer = Buffer.from(await response.arrayBuffer());
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

    for (const entry of entries) {
      if (!entry.name.toLowerCase().endsWith(".json")) {
        continue;
      }

      const entryBuffer = readZipEntryBuffer(buffer, entry);
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
  let cursor = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new BadGatewayException("Invalid Google data archive zip directory");
    }

    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer
      .subarray(cursor + 46, cursor + 46 + fileNameLength)
      .toString("utf8");

    entries.push({
      name,
      method,
      compressedSize,
      localHeaderOffset,
    });

    cursor += 46 + fileNameLength + extraLength + commentLength;
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

  if (buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new BadGatewayException("Invalid Google data archive zip entry");
  }

  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(
    dataStart,
    dataStart + entry.compressedSize,
  );

  if (entry.method === 0) {
    return compressed;
  }

  if (entry.method === 8) {
    return inflateRawSync(compressed);
  }

  throw new BadGatewayException("Unsupported Google data archive zip compression");
}
