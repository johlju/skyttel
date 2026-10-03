import type { SaveOperation, SaveReceipt } from './map.js';

/** A checked durable save outcome; no conversation consent is needed to inspect it. */
export type SaveCheck = {
  id: string;
  reply: string;
  receipt?: SaveReceipt;
  operations: SaveOperation[];
};
