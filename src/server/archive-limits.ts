const MiB = 1024 * 1024;

// Bound every on-disk part, including export intermediates. The reservation
// includes ZIP + parts, SQLite expansion/WAL during replacement, and margin.
export const archiveUploadLimit = 128 * MiB;
export const archivePartLimits = {
  'manifest.json': 16_384,
  'content.json': 32 * MiB,
  'images.bin': 64 * MiB,
};
