import { assistantFailureMessage } from './assistant-feedback.js';

const refusals = {
  assistant_busy: {
    status: 409,
    message:
      'Skyttel arbetar med tidigare uppgifter. Vänta tills de är klara innan du försöker igen.',
  },
  assistant_context_restatement_required: {
    status: 409,
    message:
      'Skyttel behöver ett nytt avgränsat uppdrag. Fortsätt i text och beskriv vad du vill göra utifrån det aktuella utkastet.',
  },
  assistant_context_summary_failed: {
    status: 409,
    message:
      'Skyttel kunde inte sammanfatta samtalet. Kontrollera det aktuella samtalet innan du försöker igen.',
  },
  assistant_delivery_unavailable: {
    status: 409,
    message:
      'Anslutningen för hela svaret försvann. Uppdraget startade inte. Säg uppdraget igen när anslutningen fungerar.',
  },
  assistant_draft_changed: {
    status: 409,
    message:
      'Utkastet eller kartan har ändrats. Säg hela uppdraget igen utifrån det aktuella utkastet.',
  },
  assistant_pending_part_changed: { status: 409 },
  assistant_turn_changed: {
    status: 409,
    message:
      'Samtalet har hunnit ändras. Kontrollera det aktuella samtalet innan du ber om uppdraget igen.',
  },
  assistant_unavailable: {
    status: 503,
    message:
      'Skyttel kunde inte starta uppdraget. Kontakta installationsansvarig om problemet kvarstår.',
  },
  assistant_work_paused: {
    status: 409,
    message: 'Samtalet är pausat. Återuppta det innan du lämnar ett nytt uppdrag.',
  },
  operation_pending: { status: 409 },
} as const;

export type VoiceMessageRefusalCode = keyof typeof refusals;

export function isVoiceMessageRefusalCode(value: unknown): value is VoiceMessageRefusalCode {
  return typeof value === 'string' && Object.hasOwn(refusals, value);
}

/** The conversation rejected this new instruction before admitting it as work. */
export class VoiceMessageRefusal extends Error {
  constructor(readonly code: VoiceMessageRefusalCode) {
    super(code);
  }

  static fromResponse(status: number, code: unknown) {
    if (isVoiceMessageRefusalCode(code) && refusals[code].status === status)
      return new VoiceMessageRefusal(code);
  }

  userMessage() {
    const refusal = refusals[this.code];
    return 'message' in refusal ? refusal.message : assistantFailureMessage(this.code);
  }
}
