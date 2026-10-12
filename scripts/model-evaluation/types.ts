export type NamedRelationship = {
  source: string;
  type: string;
  target: string | null;
  knowledge: string;
};
export type FixtureObject = {
  id: string;
  type: string;
  name: string;
  description: string;
  financialFacts?: unknown;
};
export type Expected = {
  objects?: Record<string, Record<string, unknown>>;
  addRelationships?: NamedRelationship[];
  removeRelationships?: NamedRelationship[];
  objectTypes?: { name: string; fields: { name: string; kind: string }[] }[];
  saveAttempts?: number;
  saves?: number;
  requirements: string[];
};
export type ScenarioStep = { id: string; text?: string; transition?: string; expected: Expected };
export type Scenario = {
  id: string;
  title: string;
  voice: boolean;
  startVariant?: string;
  selection?: string;
  steps: ScenarioStep[];
};
export type Catalog = {
  base: {
    objects: FixtureObject[];
    relationships: NamedRelationship[];
    relationshipTypes: {
      name: string;
      description: string;
      forwardLabel: string;
      reverseLabel: string;
    }[];
    draft: { objects: Record<string, Record<string, unknown>> };
  };
  variants: Record<
    string,
    {
      addObjects?: FixtureObject[];
      addRelationships?: NamedRelationship[];
      removeRelationships?: NamedRelationship[];
      draftObjects?: Record<string, Record<string, unknown>>;
    }
  >;
  scenarios: Scenario[];
  summaryHistory: { role: 'user' | 'assistant'; text: string }[];
};
export type Outcome = 'pass' | 'fail' | 'inconclusive' | 'error' | 'aborted' | 'not_run';
export type ContentRequirement = { id: string; source: 'backend' | 'voice'; text: string };
export type JudgeInput = {
  context: string;
  sources: Partial<Record<'backend' | 'voice', { text: string; complete: boolean }>>;
  requirements: ContentRequirement[];
};
export type JudgeResult = {
  id: string;
  outcome: 'pass' | 'fail' | 'inconclusive';
  reason: string;
}[];
export type Attempt = {
  scenario: string;
  step: string;
  profile: string;
  repetition: number;
  modality: 'text' | 'voice';
  outcome: Outcome;
  fixed: string[];
  content?: JudgeResult;
  reason?: string;
  elapsedMs: number | null;
  observedEndMs?: number;
  backendCostUsd: number | null;
  judgeCostUsd?: number | null;
  voiceCostUsd?: number | null;
  diagnostics?: ReturnType<typeof import('./observations.js').observationDiagnostics>;
};
