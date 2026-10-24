import type { SaveOperation, SaveReceipt } from '../shared/map.js';

export interface SaveAttempt {
  operationId: string;
  version: number;
  contentVersion: number;
  householdId: string;
  userId: string;
}

export interface SaveProgress {
  operationId: string;
  status: 'pending' | 'checking' | 'unknown' | 'rejected' | 'succeeded';
  message?: string;
}

export function checkSaveIdentity(
  receipt: Pick<
    SaveReceipt,
    'operationId' | 'draftVersion' | 'contentVersion' | 'householdId' | 'userId'
  >,
  attempt: SaveAttempt,
) {
  if (
    receipt.operationId !== attempt.operationId ||
    receipt.draftVersion !== attempt.version ||
    receipt.contentVersion !== attempt.contentVersion ||
    receipt.householdId !== attempt.householdId ||
    receipt.userId !== attempt.userId
  )
    throw new Error('invalid_receipt');
}

export function checkOperation(operation: SaveOperation, attempt: SaveAttempt) {
  checkSaveIdentity(operation, attempt);
  if (!['pending', 'succeeded', 'rejected'].includes(operation.status))
    throw new Error('invalid_operation');
  if (operation.status === 'succeeded') checkSaveIdentity(operation.receipt, attempt);
}

export function receiptMessage(receipt: SaveReceipt) {
  const changes = [
    ...(receipt.objectTypes ?? []).map(
      (change) =>
        `${change.after?.name ?? change.before?.name} (${change.after ? 'objekttyp' : 'borttagen objekttyp'})`,
    ),
    ...(receipt.relationshipTypes ?? []).map(
      (change) =>
        `${change.after?.name ?? change.before?.name} (${change.after ? 'sambandstyp' : 'borttagen sambandstyp'})`,
    ),
    ...receipt.changes.map((change) => change.after?.name ?? change.before?.name),
    ...(receipt.relationships ?? []).map(
      (change) => `${change.type.name} (${change.after ? 'samband' : 'borttaget samband'})`,
    ),
  ];
  return `Sparat: ${changes.join(', ')}. Kvitto: ${receipt.operationId}.`;
}

export function rejectionMessage(code: string) {
  if (code === 'assistant_session_expired')
    return 'Samtalet är inte längre tillgängligt. Inget sparades av detta försök. Ladda om sidan, granska utkastet och försök spara igen.';
  if (code === 'assistant_busy')
    return 'Skyttel arbetar fortfarande i samtalet. Inget sparades av detta försök. Vänta tills arbetet är klart eller avbryt det, granska utkastet och försök spara igen.';
  if (code === 'assistant_questions_pending')
    return 'Ändringar väntar på förtydligande i samtalet. Besvara eller återta dem innan du sparar hela utkastet.';
  if (code === 'restoration_conflict')
    return 'Det borttagna innehållet har ändrats sedan återställningsförslaget skapades. Inget sparades. Hämta aktuellt underlag, kasta det gamla återställningsförslaget och granska aktuellt underlag igen.';
  if (code === 'definition_in_use')
    return 'Typen används fortfarande i kartan eller privata utkast, även om innehållet är upphört. För en objekttyp: ta bort eller byt typ på användande objekt. För en sambandstyp: ta bort eller byt typ på sambanden; objekten kan finnas kvar. Ingen ändring genomfördes.';
  if (code === 'invalid_relationship_type')
    return 'Ange sambandstypens namn, beskrivning, benämningar från båda hållen för sambandet.';
  if (code === 'duplicate_relationship')
    return 'Samma samband finns redan. Inget sparades. Hämta aktuellt underlag och använd det befintliga sambandet eller ändra ditt förslag.';
  if (code === 'invalid_properties')
    return 'Kontrollera egenskapens etikett, datatyp och värde. Inga uppgifter sparades.';
  if (code === 'invalid_type_definition') return 'Ange namn och beskrivning för objekttypen.';
  if (code === 'client_outdated')
    return 'Skyttel har uppdaterats. Kopiera osänd text och ladda om sidan. Kontrollera tidigare sparförsök efter omladdning.';
  if (code === 'operation_conflict')
    return 'Avvisat: samma sparförsök gäller ett annat innehåll. Kontrollera det ursprungliga försöket innan du fortsätter.';
  if (code === 'content_conflict')
    return 'Avvisat: hushållets innehåll har ersatts. Det gamla försöket kan inte bekräfta eller spara det nya innehållet.';
  if (code === 'operation_pending')
    return 'Ett tidigare sparförsök är väntande. Kontrollera och återförsök det innan du ändrar utkastet.';
  return 'Avvisat: Förslaget eller kartan har ändrats. Inget sparades av detta försök. Hämta aktuellt underlag och granska hela utkastet. Välj hur varje konflikt ska lösas.';
}
