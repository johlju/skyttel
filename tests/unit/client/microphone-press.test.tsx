import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { WorkspaceTools } from '../../../src/client/WorkspaceTools.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function show(canHold = true) {
  vi.useFakeTimers();
  const start = vi.fn();
  const release = vi.fn();
  const prepare = vi.fn();
  const short = vi.fn();
  render(
    <WorkspaceTools
      expanded={false}
      onExpandedChange={() => undefined}
      onOpen={short}
      holdVoice={{ canHold, start, release, prepare }}
    />,
  );
  return {
    button: screen.getByRole('button', { name: 'Prata med Skyttel' }),
    start,
    release,
    prepare,
    short,
  };
}
const down = () => fireEvent.keyDown(window, { code: 'Space', key: ' ', ctrlKey: true });
const up = () => fireEvent.keyUp(window, { code: 'Space', key: ' ' });

test('a held shortcut crosses the threshold once and window blur releases instead of toggling', () => {
  const { button, start, release, prepare, short } = show();
  down();
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(button.getAttribute('data-held')).toBe('true');
  act(() => vi.advanceTimersByTime(449));
  expect(start).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(start).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(window, { code: 'Space', key: ' ', ctrlKey: true, repeat: true });
  fireEvent.blur(window);
  expect(release).toHaveBeenCalledTimes(1);
  expect(short).not.toHaveBeenCalled();
  expect(button.hasAttribute('data-held')).toBe(false);
  up();
  expect(release).toHaveBeenCalledTimes(1);
});

test('an unavailable hold remains a short press, and ordinary accessibility activation stays usable', () => {
  const { button, start, release, short } = show(false);
  down();
  act(() => vi.advanceTimersByTime(1000));
  up();
  expect(start).not.toHaveBeenCalled();
  expect(release).not.toHaveBeenCalled();
  expect(short).toHaveBeenCalledTimes(1);
  fireEvent.click(button, { detail: 0 });
  expect(short).toHaveBeenCalledTimes(2);
});

test('unmount while held releases the microphone and removes the global shortcut', () => {
  const { start, release, short } = show();
  down();
  act(() => vi.advanceTimersByTime(500));
  expect(start).toHaveBeenCalledTimes(1);
  cleanup();
  expect(release).toHaveBeenCalledTimes(1);
  up();
  down();
  expect(short).not.toHaveBeenCalled();
});
