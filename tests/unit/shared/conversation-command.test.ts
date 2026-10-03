import { expect, test } from 'vitest';
import { conversationCommand } from '../../../src/shared/conversation-command.js';

test.each([
  ['Nytt samtal', { reset: true, discard: false }],
  ['  KASTA UTKASTET! ', { reset: false, discard: true }],
  ['Nytt samtal och kasta utkastet.', { reset: true, discard: true }],
  ['Kasta utkastet, nytt samtal', { reset: true, discard: true }],
  ['Nytt samtal; kasta utkastet', { reset: true, discard: true }],
] as const)('the current whole command %s has only its stated effects', (text, expected) => {
  expect(conversationCommand(text)).toEqual(expected);
});

test.each([
  '',
  'Kasta inte utkastet',
  'Ska vi kasta utkastet?',
  'Kasta utkastet?',
  'Vad händer om jag säger nytt samtal?',
  '”Nytt samtal och kasta utkastet”',
  'Säg nytt samtal',
  'Nytt samtal och ändra den sista',
])('mentioning %s does not grant destructive command authority', (text) => {
  expect(conversationCommand(text)).toBeNull();
});
