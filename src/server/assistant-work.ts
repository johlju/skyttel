import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { draftConflicts } from '../shared/draft-conflicts.js';
import { financialFields } from '../shared/financial-facts.js';
import { proposedObjectTypes, proposedRelationshipTypes } from '../shared/map.js';
import {
  mergeConnections,
  mergeFacts,
  mergeNeedsChoice,
  mergeObjects,
} from '../shared/object-merge.js';
import type { householdMap } from './map.js';
import { MapError } from './map.js';

type HouseholdMap = ReturnType<typeof householdMap>;

export { assistantWorkInstructions } from './assistant-instructions.js';

export function assistantResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

export function assistantDraftReview(map: HouseholdMap) {
  const state = map.read();
  const { draft } = state;
  const conflicts = draftConflicts(state);
  const unresolvedIdentities = [
    ...draft.changes
      .filter((change) => change.after?.identity === 'unresolved')
      .map(({ id }) => ({ kind: 'object', id })),
    ...(draft.relationships ?? [])
      .filter((change) => change.after?.knowledge === 'unresolved')
      .map(({ id }) => ({ kind: 'relationship', id })),
  ];
  const changedObjectIds = new Set(draft.changes.map(({ id }) => id));
  const objectIds = new Set(changedObjectIds);
  for (const change of draft.relationships ?? []) {
    for (const edge of [change.before, change.after]) {
      if (edge) {
        objectIds.add(edge.sourceId);
        if (edge.targetId) objectIds.add(edge.targetId);
      }
    }
  }
  const relationships = state.relationships.filter(
    (edge) =>
      draft.relationships?.some((change) => change.id === edge.id) ||
      changedObjectIds.has(edge.sourceId) ||
      (edge.targetId !== null && changedObjectIds.has(edge.targetId)),
  );
  for (const edge of relationships) {
    objectIds.add(edge.sourceId);
    if (edge.targetId) objectIds.add(edge.targetId);
  }
  const pendingOperations = map
    .operations()
    .operations.filter(({ status }) => status === 'pending');
  const objects = state.objects
    .filter(({ id }) => objectIds.has(id))
    .map((object) =>
      changedObjectIds.has(object.id)
        ? object
        : { id: object.id, name: object.name, typeId: object.typeId },
    );
  const objectTypeIds = new Set([
    ...objects.map(({ typeId }) => typeId),
    ...(draft.objectTypes ?? []).map(({ id }) => id),
  ]);
  const relationshipTypeIds = new Set([
    ...relationships.map(({ typeId }) => typeId),
    ...(draft.relationshipTypes ?? []).map(({ id }) => id),
  ]);
  return {
    ...draft,
    contentVersion: state.contentVersion,
    current: {
      objects,
      relationships,
      types: state.types.filter(({ id }) => objectTypeIds.has(id)),
      relationshipTypes: state.relationshipTypes.filter(({ id }) => relationshipTypeIds.has(id)),
    },
    conflicts,
    unresolvedIdentities,
    pendingOperations,
    readyToSave:
      Boolean(
        draft.changes.length ||
          draft.relationships?.length ||
          draft.objectTypes?.length ||
          draft.relationshipTypes?.length,
      ) &&
      !conflicts.length &&
      !unresolvedIdentities.length &&
      !pendingOperations.length,
  };
}

const versionFields = {
  version: z.number().int().nonnegative(),
  contentVersion: z.number().int().positive(),
};
const id = z.string().regex(/^[\w-]{1,128}$/);
const proposalFields = {
  ...versionFields,
  id,
  baseRevision: z.number().int().positive().nullable(),
  typeRevision: z.number().int().positive().optional(),
};
const fact = z.union([
  z
    .object({
      knowledge: z.enum(['known', 'uncertain']),
      value: z.string(),
      reportedOn: z.string().optional(),
    })
    .strict(),
  z.object({ knowledge: z.enum(['unknown', 'none']), reportedOn: z.string().optional() }).strict(),
]);
const lifecycle = z.enum(['active', 'ended']).optional();
const saveFields = z.object({ ...versionFields, operationId: id }).strict();

export function registerAssistantWork(server: McpServer, map: () => HouseholdMap) {
  function run(action: (domain: HouseholdMap) => unknown) {
    try {
      return assistantResult(action(map()));
    } catch (error) {
      const known = error instanceof MapError;
      const code = known ? error.code : 'result_unknown';
      const messages: Record<string, string> = {
        unresolved_identity:
          'Identiteten är olöst. Fråga vilken person eller sak som avses, eller låt användaren uttryckligen välja ospecificerat objekt. Inget sparades.',
        operation_pending:
          'Kontrollera det väntande sparförsöket innan nya ändringar. Återförsök endast samma ID och innehåll när resultatet är känt.',
        operation_conflict:
          'Samma operations-ID gäller ett annat innehåll. Kontrollera det ursprungliga försöket; inget nytt sparades.',
        content_conflict:
          'Hushållets innehåll har ersatts. Läs om underlaget. Gamla försök och godkännanden gäller inte det nya innehållet.',
        forbidden: 'Åtkomsten är återkallad. Anslut på nytt i Skyttel.',
        invalid_request:
          'Ogiltiga uppgifter. Rätta förslaget enligt verktygets och typens definitioner.',
        definition_in_use:
          'Definitionen används av aktuellt eller upphört innehåll eller beständiga utkast. Ta bort användande objekt eller samband, eller byt deras typ först. Andras privata förslag visas inte. Inget innehåll tas bort automatiskt.',
        field_in_use:
          'Fältet har fältvärden i aktuellt eller upphört innehåll eller beständiga utkast. Hantera värdena uttryckligen innan fältet tas bort. Andras privata förslag visas inte.',
        field_kind_in_use:
          'Fältets värdeslag används. Skapa ett nytt fält med önskat värdeslag och bevara tidigare fältvärden tills de hanteras uttryckligen. Ingen automatisk konvertering görs.',
        undo_draft_overlap:
          'Ångringen överlappar ditt eget utkast. Granska och lös de berörda förslagen först; inget eget förslag ersattes. Oberoende förslag behöver inte kastas.',
        undo_unavailable:
          'Det valda sparandet kan inte återställas från hushållets tillgängliga historik. Permanent raderat innehåll kan inte ångras. Inget återställdes.',
        merge_conflict:
          'Underlaget för sammanslagningen har ändrats. Läs read_merge_review igen och gör nya aktuella val; inget slogs samman.',
        merge_choices_required:
          'Välj uttryckligen varje avvikande faktum och varje berört samband från read_merge_review. Inget slogs samman.',
        result_unknown:
          'Utfallet är okänt. Kontrollera sparförsöket före nya ändringar eller återförsök. Påstå inte att något sparades eller återställdes.',
      };
      let review: ReturnType<typeof assistantDraftReview> | undefined;
      if (known && error.status !== 403 && error.status !== 401) {
        try {
          review = assistantDraftReview(map());
        } catch {
          /* Access may no longer permit content. */
        }
      }
      return {
        ...assistantResult({
          error: code,
          message:
            messages[code] ??
            'Underlaget kan inte användas. Granska hela aktuella utkastet, red ut konflikten och invänta ett nytt sparbesked. Inga delar delsparas.',
          ...(review ? { review } : {}),
        }),
        isError: true,
      };
    }
  }
  server.registerTool(
    'read_type_catalog',
    {
      description:
        'Läs hushållets aktuella objekt- och sambandstyper, även i en tom karta. Egna typförslag i ditt utkast ingår. Använd deras stabila ID, revisioner, fält och riktning; anta aldrig en fast katalog.',
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () =>
      run((domain) => {
        const state = domain.read();
        return {
          contentVersion: state.contentVersion,
          types: proposedObjectTypes(state.types, state.draft.objectTypes),
          relationshipTypes: proposedRelationshipTypes(
            state.relationshipTypes,
            state.draft.relationshipTypes,
          ),
        };
      }),
  );
  server.registerTool(
    'propose_object_type',
    {
      description:
        'Föreslå en ny objekttyp eller ersätt hela definitionen, även en förifylld typ. value null föreslår borttagning. Ange alla fält som ska finnas kvar. Fält får lämnas obesvarade; utelämnat ja/nej är inte false. Ett använt fälts värdeslag ersätts genom ett nytt fält, aldrig automatisk konvertering. Användning i aktuellt eller upphört innehåll och privata utkast skyddas även vid sparandet. Hela ditt utkast returneras.',
      inputSchema: z
        .object({
          ...versionFields,
          id,
          baseRevision: z.number().int().positive().nullable(),
          value: z
            .object({
              name: z.string().min(1).max(200),
              description: z.string().max(2000),
              fields: z
                .array(
                  z
                    .object({
                      id,
                      name: z.string().min(1).max(200),
                      description: z.string().max(2000),
                      kind: z.enum(['text', 'number', 'date', 'boolean']),
                    })
                    .strict(),
                )
                .max(100),
            })
            .strict()
            .nullable(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (body) =>
      run((domain) => {
        domain.proposeObjectType(body);
        return assistantDraftReview(domain);
      }),
  );
  server.registerTool(
    'propose_object',
    {
      description:
        'Föreslå ett nytt objekt, ersätt hela dess förslagsvärde eller föreslå vanlig borttagning med value null. Behåll alla fakta som inte ska ändras. Använd aktuella typ-ID, typrevision och stabila objekt-ID. Bara eget utkast ändras; hela utkastet returneras. Olöst identitet måste anges som unresolved; unspecified kräver användarens uttryckliga val.',
      inputSchema: z
        .object({
          ...proposalFields,
          value: z
            .object({
              typeId: z.string(),
              name: z.string().min(1).max(200),
              description: z.string().max(2000),
              identity: z.enum(['unspecified', 'unresolved']).optional(),
              financialFacts: z
                .object(
                  Object.fromEntries(financialFields.map(({ key }) => [key, fact.optional()])),
                )
                .strict()
                .optional(),
              customValues: z
                .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
                .optional(),
              lifecycle,
              profileImageId: z.string().optional(),
            })
            .strict()
            .nullable(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (body) =>
      run((domain) => {
        domain.propose(body);
        return assistantDraftReview(domain);
      }),
  );
  server.registerTool(
    'propose_relationship_type',
    {
      description:
        'Föreslå en ny eller ändrad sambandstyp med namn, beskrivning och benämning i båda riktningarna. Behåll stabilt ID. Inga egna fält stöds. value null föreslår borttagning endast när typen inte används av aktuella eller upphörda samband eller privata utkast; inga samband tas bort automatiskt. Hela ditt utkast returneras.',
      inputSchema: z
        .object({
          ...versionFields,
          id,
          baseRevision: z.number().int().positive().nullable(),
          value: z
            .object({
              name: z.string().min(1).max(200),
              description: z.string().max(2000),
              forwardLabel: z.string().min(1).max(200),
              reverseLabel: z.string().min(1).max(200),
            })
            .strict()
            .nullable(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (body) =>
      run((domain) => {
        domain.proposeRelationshipType(body);
        return assistantDraftReview(domain);
      }),
  );
  server.registerTool(
    'propose_relationship',
    {
      description:
        'Föreslå eller rätta ett riktat samband med aktuell typ, stabila ändpunkter och typrevision. value null föreslår vanlig borttagning. known/uncertain kräver mål-ID; unknown/none/unresolved har targetId null och betyder olika saker. Hela privata utkastet returneras. Ett upprepat tillägg anger befintligt samband i existingId.',
      inputSchema: z
        .object({
          ...proposalFields,
          value: z
            .object({
              typeId: z.string(),
              sourceId: z.string(),
              targetId: z.string().nullable(),
              knowledge: z.enum(['known', 'uncertain', 'unknown', 'none', 'unresolved']),
              lifecycle,
              endDate: fact.optional(),
            })
            .strict()
            .nullable(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (body) =>
      run((domain) => {
        const result = domain.proposeRelationship(body);
        return {
          ...assistantDraftReview(domain),
          ...(result.existingId ? { existingId: result.existingId } : {}),
        };
      }),
  );
  server.registerTool(
    'read_merge_review',
    {
      description:
        'Granska en möjlig identitetsrättelse för två uttryckligt valda objekt. Lika namn bevisar inte samma företeelse. Returnerar aktuellt effektivt underlag inklusive eget utkast, berörda samband/typer och fakta som kräver val. Övriga ändpunkter innehåller bara ID, namn och typ. Be användaren bekräfta identiteten och välja varje avvikande faktum samt vilka samband som behålls eller tas bort före propose_merge.',
      inputSchema: z.object({ survivorId: id, absorbedId: id }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ survivorId, absorbedId }) =>
      run((domain) => {
        const state = domain.read();
        const effective = mergeObjects(state);
        const left = effective.get(survivorId);
        const right = effective.get(absorbedId);
        if (survivorId === absorbedId || !left || !right) throw new MapError('object_conflict');
        const relationships = mergeConnections(state, [survivorId, absorbedId]);
        const a = mergeFacts(left);
        const b = mergeFacts(right);
        const presence = (value: unknown) =>
          value === undefined ? { present: false } : { present: true, value };
        return {
          version: state.draft.version,
          contentVersion: state.contentVersion,
          reviewed: {
            objects: [left, right],
            relationships,
            types: proposedObjectTypes(state.types, state.draft.objectTypes).filter((type) =>
              [left.typeId, right.typeId].includes(type.id),
            ),
            relationshipTypes: proposedRelationshipTypes(
              state.relationshipTypes,
              state.draft.relationshipTypes,
            ).filter((type) => relationships.some((edge) => edge.typeId === type.id)),
          },
          contextObjects: [...effective.values()]
            .filter(
              (object) =>
                ![survivorId, absorbedId].includes(object.id) &&
                relationships.some(
                  (edge) => edge.sourceId === object.id || edge.targetId === object.id,
                ),
            )
            .map(({ id, name, typeId }) => ({ id, name, typeId })),
          choices: [...new Set([...Object.keys(a), ...Object.keys(b)])]
            .filter((key) => mergeNeedsChoice(key, a[key], b[key]))
            .map((field) => ({
              field,
              survivor: presence(a[field]),
              absorbed: presence(b[field]),
            })),
        };
      }),
  );
  server.registerTool(
    'propose_merge',
    {
      description:
        'Föreslå en sammanslagning av två objekt efter read_merge_review. reviewed är exakt returnerat underlag; ny ändring stoppar gammalt underlag. choices väljer survivor, absorbed eller omit för VARJE avvikande fältnyckel från choices-listan; inga värden konverteras. relationships anger keep/remove för VARJE granskat samband; kolliderande samband måste få ett uttryckligt val. identityConfirmed true kräver användarens uttryckliga besked om samma företeelse; false blockerar hela sparandet. Vald bild kopieras vid behov till bevarad identitet. Hela eget utkast returneras för granskning och separat sparande. Detta slår aldrig samman typdefinitioner.',
      inputSchema: z
        .object({
          ...versionFields,
          survivorId: id,
          absorbedId: id,
          identityConfirmed: z.boolean(),
          reviewed: z
            .object({
              objects: z.array(z.record(z.string(), z.unknown())).length(2),
              relationships: z.array(z.record(z.string(), z.unknown())),
              types: z.array(z.record(z.string(), z.unknown())),
              relationshipTypes: z.array(z.record(z.string(), z.unknown())),
            })
            .strict(),
          choices: z.record(z.string(), z.enum(['survivor', 'absorbed', 'omit'])),
          relationships: z.array(z.object({ id, action: z.enum(['keep', 'remove']) }).strict()),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (body) =>
      run((domain) => {
        domain.merge(body);
        return assistantDraftReview(domain);
      }),
  );
  server.registerTool(
    'read_history',
    {
      description:
        'Återfinn sparanden genom begränsade sammanfattningar med tid, historisk författare och antal ändringar, gärna avgränsat med objectId. limit/offset bläddrar i nyast först. Inga tidigare sakuppgifter skickas i sammanfattningen. Läs hela ett relevant samlat sparande med både operationId och userId innan ångring; då returneras kvittot med tidigare värden, samband och definitioner. userId är historisk författaridentitet, inte behörighet. Vanlig borttagning kan återställas; permanent raderat innehåll finns inte här.',
      inputSchema: z
        .object({
          objectId: id.optional(),
          operationId: id.optional(),
          userId: z.string().min(1).max(200).optional(),
          limit: z.number().int().min(1).max(50).default(20),
          offset: z.number().int().nonnegative().default(0),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ objectId, operationId, userId, limit, offset }) =>
      run((domain) => {
        if (Boolean(operationId) !== Boolean(userId) || (operationId && objectId))
          throw new MapError('invalid_request', 400);
        const { history } = domain.history();
        const contentVersion = domain.read().contentVersion;
        if (operationId) {
          const receipt = history.find(
            (item) => item.operationId === operationId && item.userId === userId,
          );
          if (!receipt) throw new MapError('undo_unavailable');
          return { contentVersion, receipt };
        }
        const relevant = history
          .filter(
            (receipt) =>
              !objectId ||
              receipt.changes.some(
                (change) => change.before?.id === objectId || change.after?.id === objectId,
              ) ||
              receipt.relationships?.some((change) =>
                [change.before, change.after].some(
                  (edge) => edge?.sourceId === objectId || edge?.targetId === objectId,
                ),
              ),
          )
          .reverse();
        const hasMore = relevant.length > offset + limit;
        return {
          contentVersion,
          history: relevant.slice(offset, offset + limit).map((receipt) => ({
            operationId: receipt.operationId,
            userId: receipt.userId,
            actorName: receipt.actorName,
            savedAt: receipt.savedAt,
            changes: {
              objects: receipt.changes.length,
              relationships: receipt.relationships?.length ?? 0,
              objectTypes: receipt.objectTypes?.length ?? 0,
              relationshipTypes: receipt.relationshipTypes?.length ?? 0,
            },
          })),
          hasMore,
          ...(hasMore ? { nextOffset: offset + limit } : {}),
        };
      }),
  );
  server.registerTool(
    'propose_undo',
    {
      description:
        'Föreslå ångring av HELA det valda tidigare sparandet som ett nytt privat utkast. Läs först kvittot via read_history. Ange dess historiska userId och operationId men dagens contentVersion och utkastversion från read_my_draft, aldrig kvittots gamla version. Oberoende senare ändringar och eget arbete bevaras; överlapp kräver aktiv lösning. Saknade äldre definitioner visas som uttryckliga återställningsförslag i hela utkastet. Detta är inget sparat återställningsresultat: granska och invänta sparbesked före save_draft.',
      inputSchema: z
        .object({ ...versionFields, operationId: id, userId: z.string().min(1).max(200) })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (body) =>
      run((domain) => {
        domain.undo(body);
        return assistantDraftReview(domain);
      }),
  );
  server.registerTool(
    'save_draft',
    {
      description:
        'Spara HELA aktuella utkastet endast på ett uttryckligt sparbesked. Använd granskad version och contentVersion, samt ett nytt stabilt operationId. Vid känt väntande försök återanvänd exakt samma ID och innehåll. Bekräfta endast det beständiga kvittot. Uteblivet svar är okänt resultat: läs sparförsöket innan något nytt görs.',
      inputSchema: saveFields,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (body) => run((domain) => domain.save(body)),
  );
  server.registerTool(
    'prepare_save',
    {
      description:
        'Registrera ett godkänt helt sparförsök beständigt före själva sparandet, med stabilt operationId och exakt granskad version/contentVersion. pending är INTE ett kvitto och ändrar inte den sparade kartan. Utkastet skyddas tills samma försök sparas eller avvisas. Använd bara efter aktuellt uttryckligt sparbesked.',
      inputSchema: saveFields,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (body) => run((domain) => domain.registerOperation(body)),
  );
  server.registerTool(
    'read_my_save_operations',
    {
      description:
        'Återfinn egna väntande och senaste sparförsök från andra klienter eller efter avbrott. Läs kvittot vid succeeded. Äldre kända ID kan hämtas med read_save_operation. Andra användares privata försök ingår inte.',
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => run((domain) => domain.operations()),
  );
  server.registerTool(
    'discard_proposal',
    {
      description:
        'Kasta ett eget osparat förslag, utan att ångra något sparat. Hela återstående utkastet returneras; beroende sambandsförslag följer formulärens regler.',
      inputSchema: z
        .object({
          ...versionFields,
          id,
          kind: z.enum(['object', 'relationship', 'objectType', 'relationshipType']),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async (body) =>
      run((domain) => {
        domain.discardChange(body);
        return assistantDraftReview(domain);
      }),
  );
  server.registerTool(
    'resolve_conflict',
    {
      description:
        'Lös en konflikt efter användarens val. Skicka exakt conflict från senaste hela utkastet och choice saved eller proposed. Samtidiga nya ändringar stoppar ett gammalt val. Svaret visar hela kvarvarande utkastet; spara först på ett aktuellt uttryckligt besked som omfattar det.',
      inputSchema: z
        .object({
          ...versionFields,
          choice: z.enum(['saved', 'proposed']),
          conflict: z.record(z.string(), z.unknown()),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (body) =>
      run((domain) => {
        domain.resolve(body);
        return assistantDraftReview(domain);
      }),
  );
  server.registerTool(
    'discard_draft',
    {
      description:
        'Kasta hela ditt aktuella privata utkast endast när användaren ber om det. Detta återställer inte tidigare sparanden. Hela det tomma utkastet och dess nya version returneras.',
      inputSchema: z.object(versionFields).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async (body) =>
      run((domain) => {
        domain.discard(body.version, body.contentVersion);
        return assistantDraftReview(domain);
      }),
  );
  server.registerTool(
    'read_save_operation',
    {
      description:
        'Kontrollera ditt sparförsök med dess operations-ID efter avbrott. succeeded ger beständigt kvitto; pending saknar slutresultat; rejected genomförde inte sparandet; null betyder att försöket inte registrerats i aktuellt innehåll. Kontrollera detta före nytt arbete.',
      inputSchema: z.object({ operationId: id }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ operationId }) => run((domain) => domain.operation(operationId)),
  );
}
