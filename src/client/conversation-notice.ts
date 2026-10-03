/** The order and wording of every conversation notice in #194, highest first. */
export const conversationNoticeDefinitions = [
  {
    id: 'saveChecking',
    text: 'Det är oklart om utkastet sparades. Skyttel kontrollerar det.',
    kind: 'blocker',
    icon: 'question',
    live: 'polite',
  },
  {
    id: 'saveCheckFailed',
    text: 'Skyttel kunde inte kontrollera om utkastet sparades.',
    action: 'Kontrollera om utkastet sparades',
    kind: 'blocker',
    icon: 'question',
    live: 'assertive',
  },
  {
    id: 'disconnectedActive',
    text: 'Ingen kontakt med Skyttel. Mikrofonen är av. Slå på den igen när kontakten är tillbaka.',
    kind: 'blocker',
    icon: 'connection',
    live: 'assertive',
    resolved: 'Kontakten med Skyttel är tillbaka.',
  },
  {
    id: 'disconnectedIdle',
    text: 'Ingen kontakt med Skyttel. Försök igen när kontakten är tillbaka.',
    kind: 'blocker',
    icon: 'connection',
    live: 'assertive',
    resolved: 'Kontakten med Skyttel är tillbaka.',
  },
  {
    id: 'unavailable',
    text: 'Samtal med Skyttel är inte tillgängligt just nu. Kontakta administratören om det fortsätter.',
    kind: 'blocker',
    icon: 'unavailable',
    live: 'assertive',
    resolved: 'Samtal med Skyttel är tillgängligt igen.',
  },
  {
    id: 'contextFull',
    text: 'Kontexten är full, och Skyttel kunde inte sammanfatta samtalet. Inget har gått förlorat, och utkastet ligger kvar.',
    action: 'Nytt samtal',
    kind: 'blocker',
    icon: 'meter',
    live: 'assertive',
  },
  {
    id: 'microphoneDenied',
    text: 'Webbläsaren tillåter inte mikrofonen. Tillåt den i webbläsarens inställningar och tryck på mikrofonknappen igen.',
    kind: 'event',
    icon: 'microphone',
    live: 'assertive',
  },
  {
    id: 'microphoneMissing',
    text: 'Ingen mikrofon hittades. Anslut en mikrofon och tryck på mikrofonknappen igen.',
    kind: 'event',
    icon: 'microphone',
    live: 'assertive',
  },
  {
    id: 'microphoneBusy',
    text: 'Mikrofonen kunde inte öppnas. Kontrollera om en annan app använder den.',
    kind: 'event',
    icon: 'microphone',
    live: 'assertive',
  },
  {
    id: 'voiceUnsupported',
    text: 'Webbläsaren har inte stöd för röst. Du kan skriva till Skyttel.',
    kind: 'event',
    icon: 'microphone',
    live: 'assertive',
  },
  {
    id: 'voiceStartFailed',
    text: 'Rösten kunde inte starta just nu. Försök igen om en stund.',
    kind: 'event',
    icon: 'warning',
    live: 'assertive',
  },
  {
    id: 'voiceInterrupted',
    text: 'Rösten avbröts. Tryck på mikrofonknappen för att fortsätta.',
    kind: 'event',
    icon: 'microphone',
    live: 'assertive',
  },
  {
    id: 'voiceAdministration',
    text: 'Rösten fungerar inte. Kontakta administratören.',
    kind: 'event',
    icon: 'warning',
    live: 'assertive',
  },
  {
    id: 'consentRevoked',
    text: 'Medgivandet är återkallat. Samtalet är avslutat. Utkastet ligger kvar.',
    kind: 'event',
    icon: 'warning',
    live: 'assertive',
  },
  {
    id: 'taskFailed',
    text: 'Skyttel kunde inte slutföra uppdraget. Försök igen.',
    kind: 'event',
    icon: 'warning',
    live: 'polite',
  },
  {
    id: 'playbackStopped',
    text: 'Webbläsaren stoppade ljudet.',
    action: 'Starta ljudet',
    kind: 'blocker',
    icon: 'speaker',
    live: 'polite',
  },
] as const;

export type ConversationNoticeId = (typeof conversationNoticeDefinitions)[number]['id'];
export type ConversationNoticeConditions = Partial<Record<ConversationNoticeId, boolean>>;
export type ConversationNotice = {
  id: ConversationNoticeId;
  text: string;
  kind: 'blocker' | 'event';
  icon: (typeof conversationNoticeDefinitions)[number]['icon'];
  live: 'assertive' | 'polite';
  action?: string;
  resolved?: string;
};

export function firstConversationNotice(conditions: ConversationNoticeConditions) {
  return conversationNoticeDefinitions.find((notice) => conditions[notice.id]);
}
