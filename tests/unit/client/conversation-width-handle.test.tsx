import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ConversationWidthHandle } from '../../../src/client/ConversationWidthHandle.js';

beforeEach(() => {
  vi.stubGlobal(
    'PointerEvent',
    class PointerEvent extends MouseEvent {
      readonly pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    },
  );
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: () => {},
  });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: () => {},
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function Width() {
  const [shown, show] = useState(400);
  const [saved, save] = useState(400);
  const [wide, setWide] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setWide(false)}>
        Visa smal vy
      </button>
      <aside id="text-view" aria-label="Textvyn" style={{ width: shown }}>
        <output aria-label="Sparad bredd">{saved}</output>
        <textarea aria-label="Oskickad text" defaultValue="Kvar under ändringen" />
      </aside>
      {wide && (
        <ConversationWidthHandle
          name="Ändra textvyns bredd"
          controls="text-view"
          value={shown}
          minimum={300}
          maximum={500}
          onPreview={show}
          onCancel={() => show(saved)}
          onCommit={(value) => {
            save(value);
            show(value);
          }}
        />
      )}
    </>
  );
}
const handle = () => screen.getByRole('separator', { name: 'Ändra textvyns bredd' });
const width = () => screen.getByRole('complementary', { name: 'Textvyn' }).style.width;
const saved = () => screen.getByLabelText('Sparad bredd').textContent;

test('the named separator offers 24 px keyboard steps and preserves unsent text at both limits', () => {
  render(<Width />);
  const separator = handle();
  separator.focus();
  fireEvent.keyDown(separator, { key: 'ArrowLeft' });
  expect(width()).toBe('424px');
  expect(saved()).toBe('424');
  expect(document.activeElement).toBe(separator);
  fireEvent.keyDown(separator, { key: 'ArrowRight' });
  expect(width()).toBe('400px');
  fireEvent.keyDown(separator, { key: 'Enter' });
  expect(width()).toBe('400px');
  for (let i = 0; i < 10; i++) fireEvent.keyDown(separator, { key: 'ArrowRight' });
  expect(width()).toBe('300px');
  for (let i = 0; i < 10; i++) fireEvent.keyDown(separator, { key: 'ArrowLeft' });
  expect(width()).toBe('500px');
  expect(separator.getAttribute('aria-valuenow')).toBe('500');
  expect(separator.getAttribute('aria-controls')).toBe('text-view');
  expect((screen.getByLabelText('Oskickad text') as HTMLTextAreaElement).value).toBe(
    'Kvar under ändringen',
  );
});

test('pointer preview commits only the captured primary drag and ignores unrelated pointers', () => {
  render(<Width />);
  const separator = handle();
  fireEvent.pointerDown(separator, { pointerId: 1, button: 2, clientX: 400 });
  fireEvent.pointerMove(separator, { pointerId: 1, clientX: 350 });
  expect(width()).toBe('400px');
  fireEvent.pointerDown(separator, { pointerId: 1, button: 0, clientX: 400 });
  fireEvent.pointerMove(separator, { pointerId: 2, clientX: 200 });
  fireEvent.pointerUp(separator, { pointerId: 2, clientX: 200 });
  expect(width()).toBe('400px');
  fireEvent.pointerMove(separator, { pointerId: 1, clientX: 350 });
  expect(width()).toBe('450px');
  expect(saved()).toBe('400');
  fireEvent.pointerUp(separator, { pointerId: 1, clientX: 350 });
  expect(saved()).toBe('450');
  fireEvent.pointerMove(separator, { pointerId: 1, clientX: 200 });
  expect(width()).toBe('450px');
});

test.each(['capture lost', 'narrow view', 'no movement'] as const)(
  'an interrupted or unchanged drag (%s) restores its persisted width rather than saving a preview',
  (end) => {
    render(<Width />);
    const separator = handle();
    fireEvent.pointerDown(separator, { pointerId: 1, button: 0, clientX: 400 });
    if (end !== 'no movement') {
      fireEvent.pointerMove(separator, { pointerId: 1, clientX: 300 });
      expect(width()).toBe('500px');
      expect(saved()).toBe('400');
    }
    if (end === 'capture lost') {
      fireEvent.lostPointerCapture(separator, { pointerId: 1 });
      fireEvent.lostPointerCapture(separator, { pointerId: 1 });
    } else if (end === 'narrow view')
      fireEvent.click(screen.getByRole('button', { name: 'Visa smal vy' }));
    else fireEvent.pointerUp(separator, { pointerId: 1, clientX: 400 });
    expect(width()).toBe('400px');
    expect(saved()).toBe('400');
    expect((screen.getByLabelText('Oskickad text') as HTMLTextAreaElement).value).toBe(
      'Kvar under ändringen',
    );
  },
);
