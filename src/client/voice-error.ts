import { MapRequestError } from './map-request.js';

const serverMessages: Record<string, string> = {
  voice_unavailable: 'Rösttjänsten är inte konfigurerad på servern. Kontakta administratören.',
  voice_provider_authentication_failed:
    'OpenAI nekade serverns API-nyckel. Administratören behöver kontrollera rösttjänstens konfiguration.',
  voice_provider_access_denied:
    'OpenAI nekade åtkomst till rösttjänsten. Administratören behöver kontrollera projektets behörighet till röstmodellen.',
  voice_provider_limit:
    'OpenAI har nått en användningsgräns. Försök igen senare eller be administratören kontrollera projektets kvot.',
  voice_provider_rejected:
    'OpenAI avvisade begäran att starta rösten. Administratören behöver kontrollera rösttjänstens konfiguration.',
  voice_provider_unavailable: 'OpenAI kunde inte starta rösttjänsten just nu. Försök igen senare.',
  voice_provider_timeout: 'OpenAI svarade inte i tid när rösten skulle starta. Försök igen.',
  voice_connection_failed:
    'Servern kunde inte ansluta till rösttjänsten. Försök igen eller kontakta administratören.',
  assistant_draft_changed:
    'Utkastet eller samtalet har ändrats. Vänta tills aktuella uppgifter har hämtats och starta rösten igen.',
  voice_session_expired: 'Röstsamtalet har avslutats eller gått ut. Starta rösten igen.',
};

export function voiceErrorMessage(failure: unknown): string | undefined {
  if (failure instanceof MapRequestError) {
    const message = serverMessages[failure.code];
    if (!message) return undefined;
    return `${message} Du kan fortsätta med text och formulär.${failure.diagnosticId ? ` Felreferens: ${failure.diagnosticId}.` : ''}`;
  }
  if (failure instanceof Error || failure instanceof DOMException) {
    if (failure.name === 'NotAllowedError')
      return 'Mikrofonen tilläts inte. Tillåt mikrofonen i webbläsaren och försök igen, eller fortsätt med text och formulär.';
    if (failure.name === 'NotFoundError')
      return 'Ingen mikrofon hittades. Anslut en mikrofon och försök igen, eller fortsätt med text och formulär.';
    if (failure.name === 'NotReadableError')
      return 'Mikrofonen kunde inte öppnas. Kontrollera om en annan app använder den och försök igen, eller fortsätt med text och formulär.';
    if (failure.name === 'NotSupportedError')
      return 'Webbläsaren saknar stöd för röstsamtal. Använd en webbläsare med stöd för mikrofon och WebRTC, eller fortsätt med text och formulär.';
  }
  return undefined;
}
