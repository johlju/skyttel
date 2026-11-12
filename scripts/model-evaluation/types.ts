import type { PropertyKind } from '../../src/shared/properties.js';

export type FixtureProperty = {
  id?: string;
  label: string;
  kind?: PropertyKind;
  value?: string | number | boolean;
};
export type NamedRelationship = {
  id?: string;
  source: string;
  /** Fixture category; expectations assert grouping only through category. */
  type: string;
  verb?: string;
  /** Expected-only meaning when the request names a role without choosing a verb.
   * A mandatory content judgment checks the observed wording against this meaning. */
  verbMeaning?: string;
  /** Only a semantic role expectation may accept both endpoint orientations. */
  direction?: 'either';
  reverseVerb?: string;
  /** Assert a category only when the user explicitly asks for that grouping. */
  category?: string;
  target: string;
  properties?: FixtureProperty[];
  lifecycle?: 'active' | 'ended';
};
export type FixtureObject = {
  id: string;
  type: string;
  name: string;
  properties?: FixtureProperty[];
  lifecycle?: 'active' | 'ended';
};
export type ScenarioFixture = {
  objects: FixtureObject[];
  relationships: (NamedRelationship & { verb: string })[];
  relationshipTypes: {
    name: string;
    description: string;
  }[];
  draft: { objects: Record<string, Record<string, unknown>> };
};
export type SemanticPropertyRule = {
  kinds?: PropertyKind[];
  value?: string | number | boolean;
  values?: Partial<Record<PropertyKind, string | number | boolean>>;
  id?: string;
  empty?: true;
};
export type SemanticProperties = {
  /** Independently stated meaning, carried forward across later requests. */
  meaning?: string;
  /** Existing property identities and complete values that must survive. */
  preserve: string[];
  /** Exactly this many additional properties, with bounded kinds/values. */
  additions?: SemanticPropertyRule[];
  anyOf?: SemanticPropertyRule[][];
};
export type Expected = {
  objects?: Record<string, Record<string, unknown>>;
  /** Only explicitly listed fields vary; independent requirements judge their
   * meaning using the complete observed map, never a success claim. */
  semanticObjects?: Record<string, { name?: true; properties?: SemanticProperties }>;
  semanticRelationships?: (Omit<NamedRelationship, 'properties'> & {
    properties: SemanticProperties;
  })[];
  /** Bounded alternative deltas on the same pre-step state. Exactly one whole
   * state must match; neither the prompt nor model output generates a branch. */
  anyOf?: Expected[];
  removeObjects?: string[];
  addRelationships?: NamedRelationship[];
  removeRelationships?: NamedRelationship[];
  objectTypes?: { name: string }[];
  saveAttempts?: number;
  saves?: number;
  /** Independently declared requests whose unfinished meaning must remain in
   * active pending work. Presence is fixed-checked; preservation is judged. */
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
  /** Safe waiting contract for a valid question without a scripted answer.
   * Preserve the original remaining meaning; never establishes task completion. */
  clarification?: Expected & { preservedRequests: string[] };
  /** Alternate safe state, never a successful completion of this step. */
  safeInability?: Expected;
  /** A declared public Stop experiment, never an ordinary successful mutation. */
  userStop?: {
    trigger: 'first-working-after-input';
    maximumObservationMs: number;
    /** Complete independently permitted atomic effects before cancellation. */
    allowedStates: Expected[];
  };
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
  /** Complete independent starting facts; never an extension inferred from output. */
  fixture?: ScenarioFixture;
  steps: ScenarioStep[];
};
export type Catalog = {
  base: ScenarioFixture;
  variants: Record<
    string,
    {
      addObjects?: FixtureObject[];
      addRelationships?: (NamedRelationship & { verb: string })[];
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
  scriptedStop?: {
    contract: 'public-user-stop-v1';
    verdict: 'pass' | 'fail' | 'inconclusive';
    trigger: 'first-working-after-input';
    requestedAt?: number;
    acknowledgedAt?: number;
    terminalAt?: number;
    audioQuiescedAt?: number;
    settledAt?: number;
    terminalStatus?: string;
    matchedState?: number;
    pendingAtStop?: { batch: boolean; save: boolean; operationIds: string[] };
    pendingAtAcknowledgment?: { batch: boolean; save: boolean };
    stateCapturedAt?: number;
    admittedMutationSpans?: {
      spanId: string | null;
      tool: string;
      endedBeforeAcknowledgment: boolean;
    }[];
    stateFailures: string[];
    /** Conservative upper input-to-Stop duration, including renderer retirement.
     * Device uncertainty stays in endpointBounds; never successfulCompletionMs. */
    endpointMs: number | null;
    endpointBounds?: import('./playback.js').TimeInterval;
    controlMs?: number | null;
    reason?: string;
    limitation: string;
  };
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
      started?: import('./playback.js').TimeInterval;
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
      estimatedCostUsd?: number | null;
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
  estimatedPlaybackAssessmentCostUsd?: number | null;
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
      | 'correctness_failure'
      | 'inconclusive';
    reason: string;
    stateFailures: string[];
    evidence: JudgeResult;
  };
  diagnostics?: ReturnType<typeof import('./observations.js').observationDiagnostics>;
  metrics?: import('./metrics.js').EvaluationMetrics;
};
