import { createContext } from 'react';

/** In-memory handoff to the sign-in surface when the voice view unmounts. */
export const VoiceSessionContext = createContext<{
  active: (value: boolean) => void;
  expired: () => void;
} | null>(null);
