/** Public categories, independent of the operator's detailed diagnostic cause. */
export type VoiceErrorGroup = 'startup' | 'interrupted' | 'administration';

export function voiceErrorGroup(
  code: string,
  fallback: VoiceErrorGroup = 'startup',
): VoiceErrorGroup {
  if (
    [
      'voice_unavailable',
      'voice_provider_authentication_failed',
      'voice_provider_access_denied',
      'voice_provider_rejected',
    ].includes(code)
  )
    return 'administration';
  if (['voice_session_expired', 'voice_connection_lost', 'voice_provider_failed'].includes(code))
    return 'interrupted';
  return fallback;
}
