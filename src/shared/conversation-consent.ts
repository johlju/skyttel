import type { SaveReceipt } from './map.js';

/**
 * The conversation consent text and its version. This is the only source of
 * the text. The consent box shows it, and every other place that shows the
 * text or names its version takes them from here.
 *
 * Changes to providers, processed content, storage, retention, sending
 * controls, or the held-speech rule are changes in substance. Raise the
 * text version so older saved and visit-only approvals no longer apply.
 *
 * Other changes are not changes in substance and keep the version: language
 * corrections and rewordings, a changed warning about secrets, a changed
 * reservation about errors, and a changed heading, checkbox or button text.
 */
export const conversationConsentTextVersion = 3;

/** The consent text, one entry per paragraph. */
export const conversationConsentText = [
  'Med ditt medgivande behandlar OpenAI ljud som spelas in medan din mikrofon är på, det du skriver, hela ditt utkast och de uppgifter i hushållets karta som behövs. Vid långt tryck kan tal från starten vänta i webbläsaren och skickas efter att du släppt knappen. Släpp stänger av ny inspelning direkt. Skyttel föreslår ändringar i ditt utkast och sparar dem först när du ber om det.',
  'När installationens sändning till LangSmith är aktiv kan LangSmith få exakt samtalstext, relevanta indata och utdata från modellen samt hushållets verktygsförfrågningar och resultat för felsökning. Rått ljud och tekniska autentiseringsuppgifter ingår inte. Samma information gäller röst och text.',
  'Installationsansvarig styr sändningen för hela installationen. Ditt samtalsmedgivande är ett separat val. LangSmith använder rullande 14 dagars grundlagring. Att stoppa sändningen eller återkalla medgivandet tar inte tillbaka redan skickade uppgifter. Radering i molnet är separat och kan ta tid; all analys- och faktureringsmetadata behöver inte försvinna inom 14 dagar. Skyttel har inget lokalt samtalsarkiv.',
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
  /** Receipts for already registered saves completed while ending the conversation. */
  receipts?: SaveReceipt[];
}

/** The server's reason for refusing conversation work without a valid consent. */
export const conversationConsentRequired = 'conversation_consent_required';

/** A previously authorized conversation was explicitly ended by revocation. */
export const conversationConsentRevoked = 'conversation_consent_revoked';
