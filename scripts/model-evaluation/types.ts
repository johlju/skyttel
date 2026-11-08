import type { PropertyKind } from '../../src/shared/properties.js';

export type FixtureProperty = {
  id?: string;
  label: string;
  kind?: PropertyKind;
  value?: string | number | boolean;
};
export type NamedRelationship = {
  source: string;
  type: string;
  target: string;
  properties?: FixtureProperty[];
};
export type FixtureObject = {
  id: string;
  type: string;
  name: string;
  properties?: FixtureProperty[];
};
export type Expected = {
  objects?: Record<string, Record<string, unknown>>;
  addRelationships?: NamedRelationship[];
  removeRelationships?: NamedRelationship[];
  objectTypes?: { name: string }[];
  saveAttempts?: number;
  saves?: number;
  preservedRequests?: string[];
  requirements: string[];
};
export type FollowUp = {
  id: string;
  text: string;
  /** Semantic question that this answer resolves; shared by all candidate models. */
  when: string;
  /** Complete allowed waiting delta; requirements validate the clarification
   * and still-answerable content instead of the parent's completion response. */
  waiting: Expected;
  requirements: string[];
  /** Explicit state after clarification; retained instructions are mandatory. */
  safeInability?: Expected & { preservedRequests: string[] };
};
export type ScenarioStep = {
  id: string;
  text?: string;
  transition?: string;
  expected: Expected;
  followUps?: FollowUp[];
  /** Alternate safe state, never a successful completion of this step. */
  safeInability?: Expected;
};
export const scenarioGroups = ['everyday', 'long_conversation', 'complex'] as const;
export type ScenarioGroup = (typeof scenarioGroups)[number];
export type Scenario = {
  id: string;
  title: string;
  voice: boolean;
  group?: ScenarioGroup;
  dimensions?: { conversation: 'short' | 'long'; instruction: 'short' | 'long' };
  history?: string;
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
  histories?: Record<string, { role: 'user' | 'assistant'; text: string }[]>;
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
  applicationVersion?: string;
  applicationCommit?: string;
  comparisonContract?: string;
  modality: 'text' | 'voice';
  group?: ScenarioGroup;
  outcome: Outcome;
  fixed: string[];
  content?: JudgeResult;
  reason?: string;
  elapsedMs: number | null;
  timing?: {
    contract: 'text-delivery-v2' | 'summary-execution-v1' | 'voice-rendered-v1';
    submittedAt: number;
    queueMs: number | null;
    firstResponseMs: number | null;
    firstUsefulMs: number | null;
    firstVerifiedUsefulMs?: number | null;
    firstUsefulLimitation?: string;
    observedResponseEndMs: number | null;
    successfulCompletionMs: number | null;
  };
  observedEndMs?: number;
  playback?: {
    contract: 'voice-rendered-v1';
    input?: {
      sha256: string;
      frames: number;
      speechFrames: number;
      drainedAt: number;
      sampleRate?: number;
      sourceStartPosition?: number;
      speechPosition?: number;
      ended: import('./playback.js').TimeInterval;
    };
    recordingSha256?: string;
    sampleRate?: number;
    frames?: number;
    firstFrame?: number;
    lastActiveFrame?: number | null;
    renderedEnd?: import('./playback.js').TimeInterval | null;
    candidates: {
      callId: string;
      profile: string;
      outcome: string;
      costUsd: number | null;
      recordingSha256: string;
      alignmentMarginMs: number;
      lastWordEndSeconds: number | null;
      requiredResponse?: JudgeResult;
      usefulContent?: JudgeResult;
      renderedEnd?: import('./playback.js').TimeInterval;
    }[];
    interruption?: string;
    error?: string;
    limitation: string;
  };
  playbackAssessmentCostUsd?: number | null;
  playbackAssessmentElapsedMs?: number;
  backendCostUsd: number | null;
  judgeCostUsd?: number | null;
  voiceCostUsd?: number | null;
  providerCalls?: number;
  followUpFor?: string;
  assistedElapsedMs?: number | null;
  assistedWallElapsedMs?: number;
  assistedEvaluationOverheadMs?: number;
  followUpSelection?: {
    selected?: string;
    candidates: { id: string; fixed: string[]; content?: JudgeResult }[];
    reason: string;
  };
  /** Evidence-based interpretation; original fixed/content/outcome stay intact. */
  assessment?: {
    kind:
      | 'necessary_clarification'
      | 'unnecessary_clarification'
      | 'safe_inability'
      | 'inconclusive';
    reason: string;
    stateFailures: string[];
    evidence: JudgeResult;
  };
  diagnostics?: ReturnType<typeof import('./observations.js').observationDiagnostics>;
  metrics?: import('./metrics.js').EvaluationMetrics;
};
