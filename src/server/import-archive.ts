import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import { openPromise } from 'yauzl';
import { validateImportReferences } from './import-references.js';
import { importContentSchema, importManifestSchema } from './import-schema.js';
import { MapError } from './map-error.js';

export const importUploadLimit = 1_100_000_000;
const limits = {
  'manifest.json': 16_384,
  'content.json': 32 * 1024 * 1024,
  'images.bin': 1024 * 1024 * 1024,
};

function parseJson(source: string): unknown {
  const value: unknown = JSON.parse(source);
  function depth(value: unknown, level: number) {
    if (level > 40) throw new MapError('invalid_archive', 400);
    if (value && typeof value === 'object')
      for (const child of Object.values(value)) depth(child, level + 1);
  }
  depth(value, 0);
  return value;
}

/** Extract only the three named parts, enforcing sizes before and during inflation. */
export async function validateImportArchive(directory: string, signal: AbortSignal) {
  const zip = await openPromise(join(directory, 'archive.zip'), {
    strictFileNames: true,
    validateEntrySizes: true,
  });
  const parts = new Map<string, { bytes: number; sha256: string }>();
  try {
    if (zip.entryCount !== 3) throw new MapError('invalid_archive', 400);
    for await (const entry of zip.eachEntry()) {
      signal.throwIfAborted();
      const name = entry.fileName as keyof typeof limits;
      if (
        !Object.hasOwn(limits, name) ||
        parts.has(name) ||
        entry.isEncrypted() ||
        ![0, 8].includes(entry.compressionMethod)
      )
        throw new MapError('invalid_archive', 400);
      if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize > limits[name])
        throw new MapError('archive_too_large', 400);
      const hash = createHash('sha256');
      let bytes = 0;
      const input = await zip.openReadStreamPromise(entry);
      await pipeline(
        input,
        new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            bytes += chunk.length;
            if (bytes > limits[name]) return callback(new MapError('archive_too_large', 400));
            hash.update(chunk);
            callback(null, chunk);
          },
        }),
        createWriteStream(join(directory, name), { flags: 'wx', mode: 0o600 }),
        { signal },
      );
      parts.set(name, { bytes, sha256: hash.digest('hex') });
    }
  } finally {
    zip.close();
  }
  const manifest = importManifestSchema.safeParse(
    parseJson(await readFile(join(directory, 'manifest.json'), 'utf8')),
  );
  if (!manifest.success) throw new MapError('unsupported_archive', 400);
  if (new Set(manifest.data.parts.map((part) => part.path)).size !== 2)
    throw new MapError('invalid_archive', 400);
  for (const part of manifest.data.parts) {
    const actual = parts.get(part.path);
    if (actual?.bytes !== part.bytes || actual.sha256 !== part.sha256)
      throw new MapError('invalid_archive', 400);
  }
  // v1/schema14, schema15 and schema16 have identical content shapes. The explicit
  // migration is ownership separation on insertion, without restoring access.
  const parsed = importContentSchema.safeParse(
    parseJson(await readFile(join(directory, 'content.json'), 'utf8')),
  );
  if (!parsed.success) throw new MapError('invalid_archive', 400);
  const content = parsed.data;
  if (content.household.id !== manifest.data.householdId)
    throw new MapError('invalid_archive', 400);
  try {
    if (validateImportReferences(content) !== parts.get('images.bin')?.bytes)
      throw new MapError('invalid_archive', 400);
    const file = await open(join(directory, 'images.bin'), 'r');
    try {
      for (const image of content.images) {
        signal.throwIfAborted();
        const bytes = Buffer.alloc(image.length);
        const read = await file.read(bytes, 0, bytes.length, image.offset);
        if (
          read.bytesRead !== bytes.length ||
          createHash('sha256').update(bytes).digest('hex') !== image.sha256
        )
          throw new MapError('invalid_archive', 400);
        const decoder = sharp(bytes, { limitInputPixels: 90_000, failOn: 'warning' });
        const metadata = await decoder.metadata();
        if (
          metadata.format !== 'webp' ||
          metadata.width !== image.width ||
          metadata.height !== image.height ||
          (metadata.pages ?? 1) !== 1
        )
          throw new MapError('invalid_archive', 400);
        await decoder.raw().toBuffer();
      }
    } finally {
      await file.close();
    }
  } catch (error) {
    if (signal.aborted) throw error;
    throw new MapError('invalid_archive', 400);
  }
  return content;
}
