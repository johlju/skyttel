import type { ObjectValue } from '../shared/map.js';

export type ObjectEditor = {
  id: string;
  version: number;
  contentVersion: number;
  baseRevision: number | null;
  typeRevision: number;
  value: ObjectValue;
};
