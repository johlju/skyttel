import { cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { ObjectActions, type ObjectActionsEntry } from '../../src/client/ObjectActions.js';
import type { MapState } from '../../src/shared/map.js';
import '../../src/client/styles.css';
import '../../src/client/spatial.css';
import '../../src/client/workspace.css';

const object = {
  id: 'lo',
  householdId: 'home',
  revision: 1,
  typeId: 'person',
  name: 'Lo Exempel',
  description: '',
};
const state: MapState = {
  userId: 'alex',
  contentVersion: 1,
  types: [],
  relationshipTypes: [],
  relationships: [],
  objects: [object],
  draft: { version: 0, changes: [], relationships: [] },
};

function ContextActions({ theme }: { theme: 'light' | 'dark' }) {
  const [entry, setEntry] = useState<ObjectActionsEntry | null>(null);
  return (
    <div className="household-map workspace-shell" data-theme={theme}>
      <button
        type="button"
        style={{ position: 'fixed', right: 0, bottom: 0 }}
        onContextMenu={(event) => {
          event.preventDefault();
          const anchor = event.currentTarget;
          setEntry({ object, anchor, restoreFocus: () => anchor.focus() });
        }}
      >
        Lo Exempel
      </button>
      {entry && (
        <ObjectActions
          entry={entry}
          state={state}
          disabled={false}
          onClose={() => setEntry(null)}
          onEdit={() => {}}
          onFocus={() => {}}
          onReveal={() => {}}
          onRead={() => {}}
          onRelationships={() => {}}
          onRemove={async () => true}
        />
      )}
      <button type="button">Nästa kontroll</button>
    </div>
  );
}

afterEach(async () => {
  cleanup();
  await page.viewport(1280, 720);
});

test.each([320, 390, 1280])(
  'context icons stay visible at edges and follow their anchor at %i pixels',
  async (width) => {
    await page.viewport(width, 720);
    for (const theme of ['light', 'dark'] as const) {
      render(<ContextActions theme={theme} />);
      const anchor = page.getByRole('button', { name: 'Lo Exempel', exact: true });
      await anchor.click({ button: 'right' });
      const actions = page.getByRole('toolbar', { name: 'Åtgärder för Lo Exempel', exact: true });
      await expect.element(actions).toBeVisible();
      const bounds = actions.element().getBoundingClientRect();
      expect(bounds.left).toBeGreaterThanOrEqual(8);
      expect(bounds.top).toBeGreaterThanOrEqual(8);
      expect(bounds.right).toBeLessThanOrEqual(width - 8);
      expect(bounds.bottom).toBeLessThanOrEqual(712);
      const originalAnchor = anchor.element().getBoundingClientRect();
      if (originalAnchor.left - bounds.width >= 8) {
        expect(bounds.right).toBeLessThan(originalAnchor.left);
      } else {
        expect(bounds.bottom).toBeLessThan(originalAnchor.top);
      }
      for (const button of actions.element().querySelectorAll('button')) {
        const box = button.getBoundingClientRect();
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(
          button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
        ).toBe(true);
      }
      const remove = page.getByRole('button', { name: 'Ta bort objekt', exact: true });
      expect(getComputedStyle(remove.element()).color).toBe(
        theme === 'light' ? 'rgb(200, 51, 70)' : 'rgb(255, 133, 138)',
      );
      const position = actions.element().getBoundingClientRect().toJSON();
      const scroll = [scrollX, scrollY];
      for (const [key, name] of [
        ['End', 'Ta bort objekt'],
        ['Home', 'Redigera objekt'],
        ['ArrowLeft', 'Ta bort objekt'],
        ['ArrowRight', 'Redigera objekt'],
      ]) {
        await userEvent.keyboard(`{${key}}`);
        const action = actions.getByRole('button', { name, exact: true });
        await expect.element(action).toHaveFocus();
        const box = action.element().getBoundingClientRect();
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.bottom).toBeLessThanOrEqual(720);
        expect(actions.element().getBoundingClientRect().toJSON()).toEqual(position);
        expect([scrollX, scrollY]).toEqual(scroll);
      }
      anchor.element().style.cssText = 'position: fixed; left: 8px; top: 8px';
      const anchorBounds = anchor.element().getBoundingClientRect();
      const roomOnRight = anchorBounds.right + 8 + bounds.width <= width - 8;
      await expect
        .poll(() => {
          const moved = actions.element().getBoundingClientRect();
          return roomOnRight ? moved.left > anchorBounds.right : moved.top > anchorBounds.bottom;
        })
        .toBe(true);
      const moved = actions.element().getBoundingClientRect();
      expect(moved.left).toBeGreaterThanOrEqual(8);
      expect(moved.right).toBeLessThanOrEqual(width - 8);
      expect(actions.element().getBoundingClientRect().top).toBeGreaterThanOrEqual(8);
      await userEvent.keyboard('{End}{Tab}');
      await expect.element(actions).not.toBeInTheDocument();
      await expect
        .element(page.getByRole('button', { name: 'Nästa kontroll', exact: true }))
        .toHaveFocus();
      cleanup();
    }
  },
);
