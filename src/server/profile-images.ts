import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import sharp, { type Metadata } from 'sharp';
import { MapError } from './map-error.js';

export const imageUploadLimit = 10_000_000;
const imageOutputLimit = 262_144;
export interface EncodedImage {
  bytes: Buffer;
  width: number;
  height: number;
}

export async function encodeProfileImage(source: ArrayBuffer): Promise<EncodedImage> {
  if (!source.byteLength || source.byteLength > imageUploadLimit)
    throw new MapError('image_size', 400);
  const input = sharp(Buffer.from(source), { limitInputPixels: 40_000_000, failOn: 'warning' });
  let metadata: Metadata;
  try {
    metadata = await input.metadata();
  } catch {
    throw new MapError('invalid_image', 400);
  }
  if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new MapError('invalid_image', 400);
  try {
    const { data, info } = await input
      .rotate()
      .resize({ width: 300, height: 300, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    if (data.length > imageOutputLimit) throw new Error('image_output_limit');
    return { bytes: data, width: info.width, height: info.height };
  } catch {
    throw new MapError('image_processing_failed', 400);
  }
}

// Access follows live references, never a secret URL or the uploader's identity.
// Discarded private versions disappear; versions used in saved history remain.
export function profileImages(database: Database.Database, householdId: string, userId: string) {
  const sharedReference = `EXISTS (SELECT 1 FROM map_object o
    WHERE o.householdId = i.householdId AND o.profileImageId = i.id)
    OR EXISTS (SELECT 1 FROM map_save s, json_each(s.receipt, '$.changes') j
      WHERE s.householdId = i.householdId AND
        (json_extract(j.value, '$.before.profileImageId') = i.id
         OR json_extract(j.value, '$.after.profileImageId') = i.id
         OR EXISTS (SELECT 1 FROM json_each(j.value, '$.merge.objects') m
           WHERE json_extract(m.value, '$.profileImageId') = i.id)))`;
  const draftReference = `EXISTS (SELECT 1 FROM map_draft d, json_each(d.changes) j
    WHERE d.householdId = i.householdId AND
      (json_extract(j.value, '$.before.profileImageId') = i.id
         OR json_extract(j.value, '$.after.profileImageId') = i.id
         OR EXISTS (SELECT 1 FROM json_each(j.value, '$.merge.objects') m
           WHERE json_extract(m.value, '$.profileImageId') = i.id))`;
  function read(id: string) {
    const image = database
      .prepare(`SELECT i.* FROM profile_image i
      WHERE i.householdId = ? AND i.id = ? AND
        (${sharedReference} OR ${draftReference} AND d.userId = ?))`)
      .get(householdId, id, userId) as (EncodedImage & { objectId: string }) | undefined;
    if (!image) throw new MapError('image_unavailable', 404);
    return image;
  }
  return {
    read,
    validate(id: unknown, objectId: string) {
      if (typeof id !== 'string' || read(id).objectId !== objectId)
        throw new MapError('image_unavailable', 404);
      return id;
    },
    insert(objectId: string, image: EncodedImage) {
      const id = randomUUID();
      database
        .prepare('INSERT INTO profile_image VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, householdId, objectId, userId, image.bytes, image.width, image.height);
      return id;
    },
    prune() {
      database
        .prepare(`DELETE FROM profile_image AS i WHERE i.householdId = ?
        AND NOT (${sharedReference} OR ${draftReference}))`)
        .run(householdId);
    },
  };
}
