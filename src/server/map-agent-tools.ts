import { z } from 'zod';
import { partReference, partUpdates, pendingQuestions } from './pending-parts.js';
import type { connectTextAssistant } from './text-assistant-mcp.js';

export const submittedChanges = z
  .object({
    version: z.number().int().nonnegative(),
    contentVersion: z.number().int().positive(),
    completion: z.enum(['draft', 'save']),
    continueResponse: z.boolean().default(false),
    questions: pendingQuestions.default([]),
    resolves: z.array(partReference).max(12).default([]),
    operations: z
      .array(z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()) }).strict())
      .min(1)
      .max(24),
  })
  .strict();

const envelope = submittedChanges.toJSONSchema({ io: 'input' });
const operationsSchema = submittedChanges.shape.operations.toJSONSchema({ io: 'input' });

export function mapAgentTools(catalog: Awaited<ReturnType<typeof connectTextAssistant>>['tools']) {
  // The executor owns the atomic transport command. The work model
  // proposes submit_changes, which must pass independent batch review.
  const tools = catalog
    .filter((tool) => !['apply_draft_batch', 'read_draft_batch'].includes(tool.name))
    .map((tool) => ({
      type: 'function' as const,
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      strict: false,
    }));
  tools.push({
    type: 'function',
    name: 'show_map_object',
    description:
      'Begär markering av ett specifikt tillåtet objekt i den öppna webbläsaren. Vänta på displayed:true innan du bekräftar markeringen. Detta är en visningsbegäran, inte en ändring av kartinnehåll.',
    parameters: {
      type: 'object',
      properties: { objectId: { type: 'string' } },
      required: ['objectId'],
      additionalProperties: false,
    },
    strict: false,
  });
  tools.push({
    type: 'function',
    name: 'show_map_item',
    description:
      'Visa ett specifikt objekt eller samband i webbläsarens karta och inspektör. Bekräfta bara ett faktiskt displayed:true från aktuell kartvy.',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['object', 'relationship'] },
        id: { type: 'string' },
      },
      required: ['kind', 'id'],
      additionalProperties: false,
    },
    strict: false,
  });
  const draftTools = catalog.filter(
    (tool) =>
      tool.annotations?.readOnlyHint === false &&
      !['save_draft', 'prepare_save', 'apply_draft_batch'].includes(tool.name),
  );
  tools.push({
    type: 'function',
    name: 'submit_changes',
    description:
      'Utför en sammanhängande ordnad ändringsbatch atomiskt med aktuella versioner. Ett nytt objekt och dess nödvändiga samband ska ingå i samma batch; ett fel lämnar hela batchen ogenomförd. Lägg självständiga delar i separata batcher. Behåll andra förslag. completion draft lämnar allt osparat; save kräver ett aktuellt uttryckligt besked om hela utkastet. questions registrerar nya väntande delar med kind, request, question och dependsOnDraft. resolves anger id och revision för förtydligade ändringsdelar som batchens återstående operationer slutför. Ofärdiga ändringsdelar hindrar sparande även efter förtydligande; oberoende informationsfrågor gör det inte. Sätt continueResponse true om ändringar, förklaring, jämförelse, faktasvar, detaljer eller markering återstår. Servern avslutar först när separat kontroll visar att ett kort verifierat besked räcker för hela uppdraget.',
    parameters: {
      type: 'object',
      properties: {
        ...envelope.properties,
        operations: {
          ...operationsSchema,
          items: {
            anyOf: draftTools.map((tool) => ({
              type: 'object',
              properties: {
                name: { const: tool.name, type: 'string' },
                arguments: {
                  ...tool.inputSchema,
                  properties: Object.fromEntries(
                    Object.entries(tool.inputSchema.properties ?? {}).filter(
                      ([key]) => key !== 'version' && key !== 'contentVersion',
                    ),
                  ),
                  required: tool.inputSchema.required?.filter(
                    (key) => key !== 'version' && key !== 'contentVersion',
                  ),
                },
              },
              required: ['name', 'arguments'],
              additionalProperties: false,
            })),
          },
        },
      },
      required: envelope.required,
      additionalProperties: false,
    },
    strict: false,
  });
  tools.push({
    type: 'function',
    name: 'ask_questions',
    description:
      'Registrera väntande delar i questions. Uppdatera endast angiven identitet och revision från pendingParts genom updates, med aktuellt messageId och ordagrant evidence ur message. clarify utan ny fråga gör en ändring redo för submit_changes.resolves; answer avslutar en informationsdel med sitt faktasvar. withdraw kräver uttryckligt återtagande; replace ersätter begäran. rephrase ändrar bara frågans formulering. Sätt continueResponse true när arbete återstår. Detta sparar ingenting.',
    parameters: {
      type: 'object',
      properties: {
        questions: z.toJSONSchema(pendingQuestions),
        updates: z.toJSONSchema(partUpdates),
        continueResponse: { type: 'boolean' },
      },
      required: ['questions'],
      additionalProperties: false,
    },
    strict: false,
  });
  tools.push({
    type: 'function',
    name: 'report_result',
    description:
      'Ge detaljer från aktuellt utkast eller ett verkligt sparande. latest_save hämtar senaste kvittot; save kräver operationId och userId från historiken. last_failure återger det senaste registrerade felet i samtalet utan att upprepa uppdraget. Texten skapas av servern från faktiska poster och fel, inte av modellen. Sätt continueResponse true om andra beställda förklaringar, jämförelser, faktasvar eller markeringar återstår; serverns detaljer behålls och resten slutförs i nästa modellomgång. Servern avslutar direkt bara när uppdragstolkningen uttryckligen visar att rapporten räcker. Medföljande modelltext används inte.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', enum: ['draft', 'latest_save', 'save', 'last_failure'] },
        continueResponse: { type: 'boolean' },
        operationId: { type: 'string' },
        userId: { type: 'string' },
      },
      required: ['source'],
      additionalProperties: false,
    },
    strict: false,
  });
  return { tools, draftTools };
}
