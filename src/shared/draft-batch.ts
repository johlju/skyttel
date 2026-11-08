/** One immutable request at the authenticated draft-batch interface. */
export type DraftBatchRequest = {
  /** Legacy callers may omit identity; recovery callers retain it before dispatch. */
  operationId?: string;
  version: number;
  contentVersion: number;
  operations: { name: string; arguments: Record<string, unknown> }[];
};
