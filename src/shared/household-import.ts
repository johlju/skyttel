export type ImportStatus = {
  id: string;
  status: 'ready' | 'cancel-cleanup' | 'prepared' | 'cleanup' | 'completed' | 'failed';
  contentVersion: number;
  confirmationContentVersion: number;
  sourceHouseholdId?: string;
  counts: Record<string, number>;
  expiresAt?: string;
  error?: string;
};

export type ImportDiscovery = { attempt: ImportStatus | null; ready: ImportStatus | null };
