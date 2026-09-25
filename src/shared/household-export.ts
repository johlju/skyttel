export type ExportPart = {
  path: 'content.json' | 'images.bin';
  bytes: number;
  sha256: string;
};

export type ExportManifest = {
  format: 'skyttel-household';
  version: 1;
  createdAt: string;
  householdId: string;
  schemaVersion: number;
  parts: ExportPart[];
};

export type ReadyExport = {
  id: string;
  bytes: number;
  expiresAt: string;
};

export const exportLifetimeMs = 10 * 60 * 1000;
