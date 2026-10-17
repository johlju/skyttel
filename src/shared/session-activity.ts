export type SessionStatus =
  | { state: 'anonymous'; serverTime: number; bindingId?: string; bindingRevision?: number }
  | {
      state: 'expired';
      serverTime: number;
      reason: 'absolute' | 'inactivity';
      sessionId: string;
      bindingId: string;
      bindingRevision: number;
    }
  | {
      state: 'active';
      serverTime: number;
      expiresAt: number;
      reason: 'absolute' | 'inactivity';
      sessionId: string;
      bindingId: string;
      bindingRevision: number;
    };

export const inactiveSessionMessage = 'Du har varit inaktiv i 30 minuter. Logga in igen.';
export const expiredSessionMessage = 'Din inloggning har gått ut. Logga in igen.';
export const sessionWarningMessage =
  'Din inloggning går ut om högst fem minuter. Du behöver sedan logga in igen.';
