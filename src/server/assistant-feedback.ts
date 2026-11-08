import { draftChangeCount, type MapDraft } from '../shared/map.js';

export function blockedActionMessage(reference: string) {
  return `Skyttel stoppade en åtgärd utanför din begäran. Kontakta installationsansvarig med felreferensen ${reference}.`;
}

/** Only server-owned wording may describe failures to the model or the person. */
export function assistantFailureMessage(code: string): string {
  switch (code) {
    case 'assistant_model_access':
      return 'Installationens konto saknar åtkomst till den valda modellen. Valet är kvar. Välj en annan modell eller kontakta installationsansvarig.';
    case 'assistant_model_unsupported':
      return 'Modellen och resonemangsnivån stöds inte eller är inte aktiverade på installationen. Valet är kvar. Välj ett aktiverat alternativ eller kontakta installationsansvarig.';
    case 'assistant_model_temporary':
      return 'Modellen är tillfälligt otillgänglig. Valet är kvar. Försök igen genom en egen handling när felet är löst.';
    case 'assistant_scope_unclear':
      return 'Förtydliga vilka ändringar du vill göra. Den oklara åtgärden har inte utförts.';
    case 'assistant_scope_unavailable':
      return 'Skyttel kunde inte kontrollera uppdragets omfattning. Den aktuella åtgärden har inte utförts.';
    case 'assistant_action_out_of_scope':
      return 'Skyttel stoppade en åtgärd utanför din begäran.';
    case 'assistant_pending_part_changed':
      return 'Den väntande delen har ändrats. Läs aktuellt samtal och fortsätt bara det arbete som återstår.';
    case 'assistant_batch_required':
      return 'De sammanhängande ändringarna kunde inte genomföras tillsammans. Inget i förslaget har ändrats. Be Skyttel försöka igen.';
    case 'assistant_batch_incomplete':
      return 'Förslaget är ofullständigt. De sammanhängande ändringarna har inte genomförts. Be Skyttel försöka igen.';
    case 'assistant_task_expired':
      return 'Uppgiftens tid är slut. Kontrollera ditt utkast och tidigare sparresultat innan du lämnar en ny instruktion.';
    case 'assistant_save_not_requested':
      return 'Inget nytt sparande är bekräftat. Det saknas ett tydligt aktuellt besked om att spara hela utkastet.';
    case 'assistant_discard_not_requested':
      return 'Hela utkastet har inte kastats. För att kasta det, säg eller skriv ”Kasta utkastet” som ett eget meddelande.';
    case 'unresolved_identity':
      return 'Det är oklart vilken person eller sak som avses. Identiteten behöver redas ut innan utkastet kan sparas.';
    case 'assistant_draft_changed':
    case 'assistant_conflict':
    case 'draft_conflict':
    case 'version_conflict':
      return 'Utkastet eller kartan har ändrats. Det aktuella underlaget och eventuella konflikter behöver kontrolleras.';
    case 'content_conflict':
      return 'Hushållets innehåll har ersatts. Det nya underlaget behöver läsas innan arbetet kan fortsätta.';
    case 'operation_pending':
    case 'assistant_save_unknown':
    case 'result_unknown':
      return 'Sparresultatet är inte bekräftat. Det tidigare sparförsöket behöver kontrolleras innan nytt arbete kan börja.';
    case 'operation_conflict':
      return 'Sparförsöket gäller ett annat innehåll. Det ursprungliga försöket behöver kontrolleras.';
    case 'assistant_object_missing':
      return 'Posten finns inte i den aktuella kartan eller utkastet och kunde därför inte markeras.';
    case 'definition_in_use':
      return 'Typborttagningen har nya följder som behöver granskas i utkastet före ett nytt sparbesked.';
    case 'definition_creation_in_use':
      return 'Den ännu osparade typen används i ditt utkast. Byt typ eller kasta de användande innehållsförslagen innan du tar bort typförslaget.';
    case 'invalid_properties':
      return 'En egenskap innehåller ett ogiltigt värde. Kontrollera etikett och datatyp.';
    case 'invalid_request':
      return 'Begäran innehöll ogiltiga uppgifter och kunde inte genomföras.';
    case 'forbidden':
    case 'unauthenticated':
      return 'Åtkomsten till hushållets karta är inte längre tillgänglig. Anslut på nytt för att fortsätta.';
    default:
      return 'Uppdraget kunde inte slutföras. Kontrollera det aktuella utkastet och eventuella sparförsök innan arbetet fortsätter.';
  }
}

/** What Skyttel says when a conversation starts over: how many unsaved changes the draft keeps. */
export function newConversationMessage(draft: MapDraft): string {
  const count = draftChangeCount(draft);
  if (!count) return 'Nytt samtal. Utkastet är tomt.';
  return `Nytt samtal. ${count === 1 ? '1 osparad ändring' : `${count} osparade ändringar`} ligger kvar i ditt utkast.`;
}
