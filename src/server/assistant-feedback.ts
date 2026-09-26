/** Only server-owned wording may describe failures to the model or the person. */
export function assistantFailureMessage(code: string): string {
  switch (code) {
    case 'assistant_save_not_requested':
      return 'Inget nytt sparande är bekräftat. Det saknas ett tydligt aktuellt besked om att spara hela utkastet.';
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
      return 'Typen används fortfarande av objekt, samband eller utkast. De behöver hanteras innan typen kan tas bort.';
    case 'field_in_use':
      return 'Fältet innehåller fortfarande uppgifter i kartan eller utkast. De behöver hanteras innan fältet kan tas bort.';
    case 'field_kind_in_use':
      return 'Fältets värdeslag kan inte ändras medan det används. Ett nytt fält behövs för det nya värdeslaget.';
    case 'undo_draft_overlap':
      return 'Ångringen överlappar dina osparade förslag. De berörda förslagen behöver redas ut först.';
    case 'undo_unavailable':
      return 'Det valda sparandet kan inte återställas från den tillgängliga historiken.';
    case 'merge_conflict':
      return 'Underlaget för sammanslagningen har ändrats. De aktuella uppgifterna behöver kontrolleras igen.';
    case 'merge_choices_required':
      return 'Sammanslagningen kräver ett val för de uppgifter och samband som skiljer sig åt.';
    case 'invalid_request':
      return 'Assistentens begäran innehöll ogiltiga uppgifter och kunde inte genomföras.';
    case 'forbidden':
    case 'unauthenticated':
      return 'Åtkomsten till hushållets karta är inte längre tillgänglig. Anslut på nytt för att fortsätta.';
    default:
      return 'Uppdraget kunde inte slutföras. Kontrollera det aktuella utkastet och eventuella sparförsök innan arbetet fortsätter.';
  }
}
