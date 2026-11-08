import type { Property } from '../../src/shared/properties.js';
import type { TextAssistantReview } from '../../src/shared/text-assistant.js';
import { lastToolResult, type ModelRequest, modelTool } from './text-model.js';

export function familySaveSequence(updateProperties: (properties: Property[]) => Property[]) {
  let step = 0;
  let version = 0;
  return (body: ModelRequest) => {
    if (step === 0 && !lastToolResult(body)) return [modelTool('read_my_draft', {})];
    if (step++ === 0) {
      const current = lastToolResult(body) as TextAssistantReview;
      return [
        modelTool('resolve_conflict', {
          version: current.version,
          contentVersion: current.contentVersion,
          conflict: current.conflicts[0],
          choice: 'proposed',
        }),
      ];
    }
    if (step === 2) {
      version = lastToolResult(body).version;
      return [modelTool('read_map', { query: 'Familjens Molnmusik' })];
    }
    if (step === 3) {
      const { id, householdId: _household, revision, ...value } = lastToolResult(body).objects[0];
      return [
        modelTool('propose_object', {
          version,
          contentVersion: 1,
          id,
          baseRevision: revision,
          value: { ...value, properties: updateProperties(value.properties) },
        }),
      ];
    }
    return [
      modelTool('save_draft', {
        version: lastToolResult(body).version,
        contentVersion: 1,
        operationId: 'family-request',
      }),
    ];
  };
}
