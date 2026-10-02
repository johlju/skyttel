/**
 * The conversation consent text and its version. This is the only source of
 * the text. The consent box shows it, and every other place that shows the
 * text or names its version takes them from here.
 *
 * The first paragraph makes four statements of substance:
 *
 * 1. OpenAI, and no other or further provider, processes the data.
 * 2. The kinds of data processed are the sound from the microphone while it
 *    is on, what the user writes, the whole draft and the data in the
 *    household's map that is needed.
 * 3. Skyttel saves changes only when the user asks for it.
 * 4. Skyttel does not save the conversation.
 *
 * A change to any of the four is a change in substance. It gives a new text
 * version: raise `conversationConsentTextVersion`. A consent saved for an
 * older version then no longer applies, and the consent box is shown again.
 *
 * Other changes are not changes in substance and keep the version: language
 * corrections and rewordings, a changed warning about secrets, a changed
 * reservation about errors, and a changed heading, checkbox or button text.
 */
export const conversationConsentTextVersion = 1;

/** The consent text, one entry per paragraph. */
export const conversationConsentText = [
  'Med ditt medgivande behandlar OpenAI ljudet från din mikrofon medan den är på, det du skriver, hela ditt utkast och de uppgifter i hushållets karta som behövs. Skyttel föreslår ändringar i ditt utkast och sparar dem först när du ber om det. Skyttel sparar inte samtalet.',
  'Skyttel kan höra och förstå fel. Kartan visar vad som har ändrats och sparats.',
  'Säg eller skriv inga lösenord, koder eller fullständiga konto- och kortnummer.',
] as const;

/** A consent that a Skyttel user has saved for one household. */
export interface SavedConversationConsent {
  /** The version of the consent text that the user approved. */
  textVersion: number;
  savedAt: string;
}

export interface ConversationConsentView {
  saved: SavedConversationConsent | null;
}

/** The server's reason for refusing conversation work without a valid consent. */
export const conversationConsentRequired = 'conversation_consent_required';
