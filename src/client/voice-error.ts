import { type VoiceErrorGroup, voiceErrorGroup } from '../shared/voice-error.js';
import { type ConversationNoticeId, conversationNoticeDefinitions } from './conversation-notice.js';
import { MapRequestError } from './map-request.js';

export type VoiceFailure = { noticeId: ConversationNoticeId; diagnosticId?: string };
const browserNotices: Record<string, ConversationNoticeId> = {
  NotAllowedError: 'microphoneDenied',
  NotFoundError: 'microphoneMissing',
  NotReadableError: 'microphoneBusy',
  NotSupportedError: 'voiceUnsupported',
};
const groupNotices: Record<VoiceErrorGroup, ConversationNoticeId> = {
  startup: 'voiceStartFailed',
  interrupted: 'voiceInterrupted',
  administration: 'voiceAdministration',
};
export function voiceErrorNotice(
  failure: unknown,
  fallback: VoiceErrorGroup = 'startup',
): VoiceFailure {
  if (failure instanceof MapRequestError)
    return {
      noticeId: groupNotices[failure.voiceErrorGroup ?? voiceErrorGroup(failure.code, fallback)],
      diagnosticId: failure.diagnosticId,
    };
  return {
    noticeId:
      ((failure instanceof Error || failure instanceof DOMException) &&
        browserNotices[failure.name]) ||
      groupNotices[fallback],
  };
}
export function voiceFailureMessage(failure: VoiceFailure | null): string {
  if (!failure) return '';
  const text =
    conversationNoticeDefinitions.find((notice) => notice.id === failure.noticeId)?.text ?? '';
  return text + (failure.diagnosticId ? ` Felreferens: ${failure.diagnosticId}.` : '');
}
