export type MembershipRole = 'administrator' | 'member';

export interface HouseholdMember {
  userId: string;
  name: string;
  role: MembershipRole;
}

export interface HouseholdInvitation {
  id: string;
  userId: string;
  name: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  createdAt: string;
  expiresAt: string;
}

export interface Administration {
  members: HouseholdMember[];
  invitations: HouseholdInvitation[];
}
