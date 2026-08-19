import { gzipSync, gunzipSync } from 'node:zlib';

export interface EncodedSnapshot {
  compressed: Uint8Array;
  uncompressedBytes: number;
}

export function encodeSnapshot(value: unknown): EncodedSnapshot {
  const source = Buffer.from(JSON.stringify(value), 'utf8');
  return {
    compressed: gzipSync(source, { level: 6 }),
    uncompressedBytes: source.byteLength,
  };
}

export function decodeSnapshot<T>(value: Uint8Array): T {
  return JSON.parse(gunzipSync(value).toString('utf8')) as T;
}
