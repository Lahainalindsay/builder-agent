import fs from "node:fs";
import path from "node:path";

interface ZipEntry {
  name: string;
  data: Buffer;
  crc32: number;
  offset: number;
}

export function zipProject(projectDir: string, outputZipPath: string): string | null {
  const entries = collectEntries(projectDir, path.basename(projectDir));
  const chunks: Buffer[] = [];
  const centralDirectory: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    entry.offset = offset;
    const localHeader = buildLocalHeader(entry);
    chunks.push(localHeader, entry.data);
    offset += localHeader.length + entry.data.length;
  }

  let centralSize = 0;
  for (const entry of entries) {
    const record = buildCentralDirectoryRecord(entry);
    centralDirectory.push(record);
    centralSize += record.length;
  }

  const centralOffset = offset;
  const endRecord = buildEndOfCentralDirectory(entries.length, centralSize, centralOffset);
  const zipBuffer = Buffer.concat([...chunks, ...centralDirectory, endRecord]);

  fs.writeFileSync(outputZipPath, zipBuffer);
  return outputZipPath;
}

function collectEntries(rootDir: string, prefix: string): ZipEntry[] {
  const entries: ZipEntry[] = [];

  function walk(currentDir: string, currentPrefix: string): void {
    const items = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(currentDir, item.name);
      const zipName = `${currentPrefix}/${item.name}`.replace(/\\/g, "/");

      if (item.isDirectory()) {
        walk(fullPath, zipName);
        continue;
      }

      const data = fs.readFileSync(fullPath);
      entries.push({
        name: zipName,
        data,
        crc32: crc32(data),
        offset: 0
      });
    }
  }

  walk(rootDir, prefix);
  return entries;
}

function buildLocalHeader(entry: ZipEntry): Buffer {
  const fileName = Buffer.from(entry.name, "utf8");
  const header = Buffer.alloc(30 + fileName.length);
  let cursor = 0;

  cursor = writeUInt32(header, cursor, 0x04034b50);
  cursor = writeUInt16(header, cursor, 20);
  cursor = writeUInt16(header, cursor, 0);
  cursor = writeUInt16(header, cursor, 0);
  cursor = writeUInt16(header, cursor, 0);
  cursor = writeUInt16(header, cursor, 0);
  cursor = writeUInt32(header, cursor, entry.crc32);
  cursor = writeUInt32(header, cursor, entry.data.length);
  cursor = writeUInt32(header, cursor, entry.data.length);
  cursor = writeUInt16(header, cursor, fileName.length);
  cursor = writeUInt16(header, cursor, 0);
  fileName.copy(header, cursor);
  return header;
}

function buildCentralDirectoryRecord(entry: ZipEntry): Buffer {
  const fileName = Buffer.from(entry.name, "utf8");
  const record = Buffer.alloc(46 + fileName.length);
  let cursor = 0;

  cursor = writeUInt32(record, cursor, 0x02014b50);
  cursor = writeUInt16(record, cursor, 20);
  cursor = writeUInt16(record, cursor, 20);
  cursor = writeUInt16(record, cursor, 0);
  cursor = writeUInt16(record, cursor, 0);
  cursor = writeUInt16(record, cursor, 0);
  cursor = writeUInt16(record, cursor, 0);
  cursor = writeUInt32(record, cursor, entry.crc32);
  cursor = writeUInt32(record, cursor, entry.data.length);
  cursor = writeUInt32(record, cursor, entry.data.length);
  cursor = writeUInt16(record, cursor, fileName.length);
  cursor = writeUInt16(record, cursor, 0);
  cursor = writeUInt16(record, cursor, 0);
  cursor = writeUInt16(record, cursor, 0);
  cursor = writeUInt16(record, cursor, 0);
  cursor = writeUInt32(record, cursor, 0);
  cursor = writeUInt32(record, cursor, entry.offset);
  fileName.copy(record, cursor);
  return record;
}

function buildEndOfCentralDirectory(count: number, size: number, offset: number): Buffer {
  const record = Buffer.alloc(22);
  let cursor = 0;

  cursor = writeUInt32(record, cursor, 0x06054b50);
  cursor = writeUInt16(record, cursor, 0);
  cursor = writeUInt16(record, cursor, 0);
  cursor = writeUInt16(record, cursor, count);
  cursor = writeUInt16(record, cursor, count);
  cursor = writeUInt32(record, cursor, size);
  cursor = writeUInt32(record, cursor, offset);
  writeUInt16(record, cursor, 0);
  return record;
}

function writeUInt16(buffer: Buffer, offset: number, value: number): number {
  buffer.writeUInt16LE(value, offset);
  return offset + 2;
}

function writeUInt32(buffer: Buffer, offset: number, value: number): number {
  buffer.writeUInt32LE(value >>> 0, offset);
  return offset + 4;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = (() => {
  const table: number[] = [];
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table.push(c >>> 0);
  }
  return table;
})();
