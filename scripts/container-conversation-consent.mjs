import assert from 'node:assert/strict';

/** Use the consent information shipped by the image under test. */
export async function containerConversationConsent(command, name) {
  const textVersion = Number(
    await command([
      'exec',
      name,
      'node',
      '--input-type=module',
      '-e',
      "import { conversationConsentTextVersion } from './dist/shared/conversation-consent.js'; console.log(conversationConsentTextVersion);",
    ]),
  );
  assert.ok(Number.isSafeInteger(textVersion) && textVersion > 0);
  return { consent: { textVersion } };
}
