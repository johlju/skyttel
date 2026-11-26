import { modelMessage, modelTool, readOnlyScope, textModel } from './text-model.js';

export const bikeQuestion = 'Vad ändrade du precis? Ange objektets namn och id.';

export function blueBikeModel(bikeId: string, vehicleTypeId: () => string) {
  return textModel(
    (request) => {
      const envelope = JSON.parse(
        String(request.input.findLast((item) => item.role === 'user')?.content),
      );
      if (envelope.message === bikeQuestion) {
        const history = request.input.find((item) => item.role === 'assistant');
        const conversation = JSON.parse(String(history?.content)).recentConversation;
        const change = conversation.findLast((entry: { result?: unknown }) => entry.result)?.result
          .changes[0];
        return [modelMessage(`${change?.subject} (${change?.objectId})`)];
      }
      return [
        modelTool('submit_changes', {
          version: envelope.draft.version,
          contentVersion: envelope.draft.contentVersion,
          completion: 'draft',
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: bikeId,
                baseRevision: null,
                value: { name: 'Blå cykeln', typeId: vehicleTypeId(), properties: [] },
              },
            },
          ],
        }),
      ];
    },
    (request) => {
      if (request.instructions.startsWith('SKYTTEL_TURN_SCOPE')) {
        const { current } = JSON.parse(String(request.input[0].content));
        return current === bikeQuestion
          ? readOnlyScope()
          : [
              modelMessage(
                JSON.stringify({
                  mode: 'work',
                  request: current,
                  responseRequired: false,
                }),
              ),
            ];
      }
      return [modelMessage('{"decision":"allow","complete":true,"fulfillsRequest":true}')];
    },
  );
}
