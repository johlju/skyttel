import type { HouseholdMember } from './administration.js';

export interface ContentIdentity {
  id: string;
  name: string;
  userId: string | null;
  draftChanges: number;
  positions: number;
  hasViewSettings: boolean;
}

export interface ContentOwners {
  contentVersion: number;
  identities: ContentIdentity[];
  members: HouseholdMember[];
  pendingOperations: number;
}
