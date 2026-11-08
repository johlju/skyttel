import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { conflictBasis, conflictProperties } from '../shared/conflict-properties.js';
import { draftConflicts } from '../shared/draft-conflicts.js';
import { proposedObjectTypes, proposedRelationshipTypes } from '../shared/map.js';
import { isObjectIconId, searchObjectIcons } from '../shared/object-icons.js';
import { propertyInputSchema } from '../shared/properties.js';
import { draftDiscards } from './draft-discards.js';
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
      changedObjectIds.has(edge.targetId),
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
    resolutions: conflicts.map((conflict) => ({
      conflict,
      basis: conflictBasis(state, conflict),
      properties: conflictProperties(state, conflict),
    })),
    blockedRelationships: conflicts
      .filter((conflict) => conflict.kind === 'relationship' && conflict.missingEndpoints?.length)
      .map(({ id, missingEndpoints }) => ({
        id,
        missingEndpoints,
        reason:
          'Ett ändpunktsobjekt är borttaget. Förslaget finns kvar utanför den effektiva kartan och blockerar hela utkastets sparande.',
        correction:
          'Rätta förslaget med propose_relationship och samma ID, välj befintliga objekt i hushållet, eller kasta det med discard_proposal. Återskapa inte borttagna objekt.',
      })),
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
const lifecycle = z.enum(['active', 'ended']).optional();
const saveFields = z.object({ ...versionFields, operationId: id }).strict();

export function registerAssistantWork(
  server: McpServer,
  map: () => HouseholdMap,
  database: Database.Database,
) {
  const mutations = new Map<
    string,
    { schema: z.ZodType; apply: (domain: HouseholdMap, body: unknown) => unknown }
  >();
  function registerDraftTool<T>(
    name: string,
    config: {
      description: string;
      inputSchema: z.ZodType<T>;
      annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean };
    },
    apply: (domain: HouseholdMap, body: T) => unknown,
  ) {
    mutations.set(name, {
      schema: config.inputSchema,
      apply: (domain, body) => apply(domain, config.inputSchema.parse(body)),
    });
    server.registerTool(name, config, async (body) => run((domain) => apply(domain, body)));
  }
  function run(action: (domain: HouseholdMap) => unknown) {
    try {
      return assistantResult(action(map()));
    } catch (error) {
      const known = error instanceof MapError;
      const code = known ? error.code : 'result_unknown';
      const messages: Record<string, string> = {
        invalid_properties:
          'Ogiltiga egenskaper. Behåll egenskapernas ID och ordning. Ange ett giltigt värde för datatypen eller töm värdet. Ditt övriga utkast finns kvar.',
        invalid_endpoint:
          'Ändpunkten saknas eller är ogiltig. Läs verkliga objekt och fråga vilken ändpunkt som avses före ett nytt förslag. Hitta inte på motpart eller ersättningsobjekt. Ditt övriga utkast finns kvar.',
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
          'Ogiltiga uppgifter. Rätta förslaget enligt verktygets egenskaps- och typdefinitioner.',
        definition_in_use:
          'Typborttagningen har nya följder. Föreslå den igen mot aktuellt underlag, granska hela utkastet och invänta ett nytt uttryckligt sparbesked. Inget sparades.',
        definition_creation_in_use:
          'Den ännu osparade typen används i ditt utkast. Byt typ eller kasta de användande innehållsförslagen innan du tar bort typförslaget. Inget ändrades.',
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
    'search_object_icons',
    {
      description:
        'Sök hela Lucide-katalogen med svenska sökord eller engelska ikonnamn. Alla ikoner kan användas för alla objekt. Använd ett returnerat stabilt ID i propose_object. Profilbilden visas före ikonen.',
      inputSchema: z
        .object({ query: z.string().max(200), offset: z.number().int().nonnegative().optional() })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ query, offset = 0 }) =>
      run((domain) => {
        domain.read();
        const icons = searchObjectIcons(query);
        return {
          total: icons.length,
          offset,
          icons: icons.slice(offset, offset + 24).map(({ id, label }) => ({ id, label })),
        };
      }),
  );
  server.registerTool(
    'read_type_catalog',
    {
      description:
        'Läs hushållets aktuella objekt- och sambandstyper, även i en tom karta. Egna typförslag i ditt utkast ingår. Använd deras stabila ID, revisioner och riktning; anta aldrig en fast katalog.',
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
  registerDraftTool(
    'propose_object_type',
    {
      description:
        'Föreslå en ny objekttyp eller ersätt dess namn och gemensamma beskrivning, även förifyllda typer. value null föreslår borttagning. En typ ger inga egna fält: fria egenskaper hör till enskilda objekt och bevaras vid typbyte. Använd stabila typ-ID och aktuell revision. Borttagning samlar också användande objekt och deras anslutna samband i utkastet, även upphört innehåll. Granska hela gruppen före samlat sparande. Andras utkast hindrar inte borttagning. Hela ditt utkast returneras.',
      inputSchema: z
        .object({
          ...versionFields,
          id,
          baseRevision: z.number().int().positive().nullable(),
          value: z
            .object({
              name: z.string().min(1).max(200),
              description: z.string().max(2000),
            })
            .strict()
            .nullable(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (domain, body) => {
      domain.proposeObjectType({
        ...body,
        value: body.value,
      });
      return assistantDraftReview(domain);
    },
  );
  registerDraftTool(
    'propose_object',
    {
      description:
        'Föreslå ett nytt objekt, ersätt hela dess förslagsvärde eller föreslå vanlig borttagning med value null. Behåll alla fakta som inte ska ändras. Använd aktuella typ-ID, typrevision och stabila objekt-ID. Bara eget utkast ändras; hela utkastet returneras. properties är hela den ordnade listan fria egenskaper: behåll returnerade egenskaps-ID vid rättelser, töm genom att utelämna value, ta bort genom att utesluta posten, ordna genom listans ordning. Utelämna id på nya egenskaper så tilldelas och returneras identiteten. Etiketter får upprepas och har ingen automatisk ekonomisk eller datumstyrd betydelse. Utelämnad properties behåller listan, [] tar bort alla. kind är text, number, date eller boolean; utelämnat kind tillåts bara utan value. 0, false och tom text är värden. Respektera uttrycklig datatyp. Härled bara entydig datatyp, exempelvis telefonnummer som text; fråga före tillägg vid oklar datatyp. Fråga före rättelse eller borttagning när samma etikett har flera möjliga identiteter. Typbyte kräver giltigt eller tomt värde. iconId väljs från search_object_icons: ett ID sätter ikonen, null återgår till typens standardikon och utelämnat fält behåller valet. Bildbyte och typbyte behåller ikonen. Olöst identitet måste anges som unresolved; unspecified kräver användarens uttryckliga val.',
      inputSchema: z
        .object({
          ...proposalFields,
          value: z
            .object({
              typeId: z.string(),
              name: z.string().min(1).max(200),
              identity: z.enum(['unspecified', 'unresolved']).optional(),
              properties: z.array(propertyInputSchema).optional(),
              lifecycle,
              profileImageId: z.string().optional(),
              iconId: z.string().refine(isObjectIconId).nullable().optional(),
            })
            .strict()
            .nullable(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (domain, body) => {
      domain.propose({
        ...body,
        value: body.value,
      });
      return assistantDraftReview(domain);
    },
  );
  registerDraftTool(
    'propose_relationship_type',
    {
      description:
        'Föreslå en ny eller ändrad sambandstyp med namn, gemensam beskrivning och benämning i båda riktningarna. Behåll stabila typ-ID. Fria egenskaper hör till enskilda samband och bevaras vid typbyte. value null föreslår borttagning av typen och dess samband, även upphörda, i en samlad granskning. Ändpunkternas objekt behålls. Andras utkast hindrar inte borttagning. Hela ditt utkast returneras.',
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
    (domain, body) => {
      domain.proposeRelationshipType(body);
      return assistantDraftReview(domain);
    },
  );
  registerDraftTool(
    'propose_relationship',
    {
      description:
        'Föreslå eller rätta ett riktat samband med aktuell typ, stabila ändpunkter och typrevision. value null föreslår vanlig borttagning. Både sourceId och targetId kräver verkliga objekt i samma hushåll eller det egna giltiga utkastet. Saknad ändpunkt måste rättas före skapande; hitta inte på någon motpart. Hela privata utkastet returneras. properties är hela den ordnade listan fria egenskaper: behåll returnerade egenskaps-ID vid rättelser, utelämna id på nya poster, töm genom att utelämna value, ta bort genom att utesluta posten och ordna genom listans ordning. Etiketter får upprepas och har ingen särskild verkan på datum, ekonomi eller status. Utelämnad properties behåller listan, [] tar bort alla. kind är text, number, date eller boolean; utelämnat kind tillåts bara utan value. 0, false och tom text är värden. Respektera uttrycklig datatyp; fråga före tillägg vid oklar datatyp och före rättelse eller borttagning vid flera möjliga egenskapsidentiteter. Typbyte kräver giltigt eller tomt värde och bevarar fria egenskaper. Ett upprepat tillägg anger befintligt samband i existingId.',
      inputSchema: z
        .object({
          ...proposalFields,
          value: z
            .object({
              typeId: z.string(),
              properties: z.array(propertyInputSchema).optional(),
              sourceId: id,
              targetId: id,
              lifecycle,
            })
            .strict()
            .nullable(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (domain, body) => {
      const result = domain.proposeRelationship({
        ...body,
        value: body.value,
      });
      return {
        ...assistantDraftReview(domain),
        ...(result.existingId ? { existingId: result.existingId } : {}),
      };
    },
  );
  server.registerTool(
    'read_history',
    {
      description:
        'Återfinn sparanden genom begränsade sammanfattningar med tid, historisk författare och antal ändringar, gärna avgränsat med objectId. limit/offset bläddrar i nyast först. Inga tidigare sakuppgifter skickas i sammanfattningen. Läs hela ett relevant samlat sparande med både operationId och userId; då returneras kvittot med tidigare värden, samband och definitioner. userId är historisk författaridentitet, inte behörighet. Permanent raderat innehåll finns inte här.',
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
          if (!receipt) throw new MapError('history_unavailable');
          return { contentVersion, receipt };
        }
        const relevant = history.filter(
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
        );
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
  registerDraftTool(
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
    (domain, body) => {
      domain.discardChange(body);
      return assistantDraftReview(domain);
    },
  );
  registerDraftTool(
    'resolve_conflict',
    {
      description:
        'Lös en konflikt efter användarens val. Läs resolutions från senaste hela utkastet: conflict och basis ska återges exakt. choices väljer saved eller proposed per returnerad egenskapsnyckel; automatiska oberoende ändringar bevaras. Fråga om varje verklig konflikt före valet. choice saved eller proposed kan välja hela posten. Samtidiga nya ändringar stoppar ett gammalt val. Svaret visar hela kvarvarande utkastet; spara först på ett aktuellt uttryckligt besked som omfattar det.',
      inputSchema: z
        .object({
          ...versionFields,
          choice: z.enum(['saved', 'proposed']).optional(),
          choices: z.record(z.string(), z.enum(['saved', 'proposed'])).optional(),
          basis: z.record(z.string(), z.unknown()).optional(),
          conflict: z.record(z.string(), z.unknown()),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (domain, body) => {
      domain.resolve(body);
      return assistantDraftReview(domain);
    },
  );
  registerDraftTool(
    'discard_draft',
    {
      description:
        'Kasta hela ditt aktuella privata utkast endast när användaren ber om det. Detta återställer inte tidigare sparanden. Hela det tomma utkastet och dess nya version returneras.',
      inputSchema: z.object(versionFields).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    (domain, body) => {
      domain.discard(body.version, body.contentVersion);
      return assistantDraftReview(domain);
    },
  );
  server.registerTool(
    'apply_draft_batch',
    {
      description:
        'Genomför en sammanhängande ordnad batch av utkaständringar atomiskt. Ange aktuella versioner en gång; operationerna använder de verifierade versionerna i beroendeordning. Ett fel lämnar hela utkastet oförändrat. Sparande ingår inte i batchen.',
      inputSchema: z
        .object({
          ...versionFields,
          operations: z
            .array(
              z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()) }).strict(),
            )
            .min(1)
            .max(24),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async (body) =>
      run((domain) =>
        draftDiscards(database).atomic(() => {
          let review = assistantDraftReview(domain);
          if (review.version !== body.version || review.contentVersion !== body.contentVersion)
            throw new MapError('draft_conflict');
          // Validate the whole request before its first mutation; domain checks
          // still run for every operation inside this same SQLite transaction.
          for (const operation of body.operations) {
            const tool = mutations.get(operation.name);
            if (
              !tool ||
              'version' in operation.arguments ||
              'contentVersion' in operation.arguments ||
              !tool.schema.safeParse({
                ...operation.arguments,
                version: body.version,
                contentVersion: body.contentVersion,
              }).success
            )
              throw new MapError('invalid_request', 400);
          }
          const applied = [];
          for (const operation of body.operations) {
            const tool = mutations.get(operation.name);
            if (!tool) throw new MapError('invalid_request', 400);
            const before = review;
            const args = {
              ...operation.arguments,
              version: review.version,
              contentVersion: review.contentVersion,
            };
            tool.apply(domain, args);
            review = assistantDraftReview(domain);
            applied.push({ ...operation, before, after: review });
          }
          return { ...review, applied };
        }),
      ),
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
