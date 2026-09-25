import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { ContentOwners } from '../../../src/client/ContentOwners.js';
import type { ContentOwners as OwnerState } from '../../../src/shared/content-owners.js';

const initial: OwnerState = {
  contentVersion: 2,
  pendingOperations: 1,
  members: [{ userId: 'current', name: 'Alex', role: 'administrator' }],
  identities: [
    {
      id: 'historic',
      name: 'Alex',
      userId: null,
      draftChanges: 2,
      positions: 3,
      hasViewSettings: true,
    },
    {
      id: 'native',
      name: 'Alex',
      userId: 'current',
      draftChanges: 1,
      positions: 1,
      hasViewSettings: true,
    },
  ],
};
const load = () =>
  userEvent.click(screen.getByRole('button', { name: 'Hämta aktuella innehållskopplingar' }));
const submit = () =>
  screen.getByRole('button', { name: 'Bekräfta innehållskopplingen' }) as HTMLButtonElement;
async function choose() {
  await load();
  await userEvent.selectOptions(screen.getByLabelText('Historisk innehållsidentitet'), 'historic');
  await userEvent.selectOptions(screen.getByLabelText('Aktuell verifierad medlem'), 'current');
}
async function confirm() {
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(submit());
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('an uncertain assignment stays locked when its status read also fails and resumes only after an authoritative read', async () => {
  let reads = 0;
  let writes = 0;
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      writes++;
      throw new TypeError('lost reply after commit');
    }
    reads++;
    if (reads === 2) throw new TypeError('status unavailable');
    return Response.json(
      reads === 1
        ? initial
        : {
            ...initial,
            contentVersion: 3,
            identities: initial.identities.map((row) => ({
              ...row,
              userId: row.id === 'historic' ? 'current' : null,
            })),
          },
    );
  });
  render(<ContentOwners householdId="linden" onAccessLost={vi.fn()} />);
  await choose();
  await confirm();
  expect((await screen.findByRole('alert')).textContent).toContain('Utfallet är okänt');
  const group = screen.getByRole('group', { name: 'Granska kopplingen' }) as HTMLFieldSetElement;
  expect(group.disabled).toBe(true);
  await load();
  expect(group.disabled).toBe(true);
  expect(writes).toBe(1);
  await load();
  expect(group.disabled).toBe(false);
  expect(screen.queryByText('Innehållskopplingen är sparad.')).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText('Historisk innehållsidentitet'), 'historic');
  expect(screen.getByText(/Nuvarande koppling: Alex \(current\)/)).toBeDefined();
  expect(submit().disabled).toBe(true);
});

test('review identifies both IDs and displaced work, requires confirmation, and sends only the reviewed generation', async () => {
  const attempts: unknown[] = [];
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      attempts.push(JSON.parse(String(init.body)));
      return Response.json({ ...initial, contentVersion: 3 });
    }
    return Response.json(initial);
  });
  render(<ContentOwners householdId="linden" onAccessLost={vi.fn()} />);
  expect(screen.queryByLabelText('Historisk innehållsidentitet')).toBeNull();
  await choose();
  expect(screen.getByText(/Den valda medlemmen lämnar Alex \(native\)/)).toBeDefined();
  expect(screen.getByText(/1 väntande sparförsök blir ogiltiga/)).toBeDefined();
  expect(submit().disabled).toBe(true);
  await userEvent.click(submit());
  expect(attempts).toEqual([]);
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.selectOptions(screen.getByLabelText('Aktuell verifierad medlem'), '');
  expect(submit().disabled).toBe(true);
  await confirm();
  expect(await screen.findByText('Innehållskopplingen är sparad.', { exact: true })).toBeDefined();
  expect(attempts).toEqual([
    { identityId: 'historic', userId: null, contentVersion: 2, confirmed: true },
  ]);
});

test.each([
  'content_conflict',
  'identity_unavailable',
  'verified_member_required',
  'content_maintenance',
])('%s requires reading current ownership and a fresh review', async (error) => {
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? Response.json({ error }, { status: 409 })
      : Response.json({
          ...initial,
          identities: initial.identities.map((row) => ({ ...row, hasViewSettings: false })),
        }),
  );
  render(<ContentOwners householdId="linden" onAccessLost={vi.fn()} />);
  await choose();
  await confirm();
  expect((await screen.findByRole('alert')).textContent).toContain('granska igen');
  expect(submit().disabled).toBe(true);
  await load();
  expect(screen.queryByRole('alert')).toBeNull();
});

test.each([401, 403])('loss of access with HTTP %s clears owner metadata', async (status) => {
  const lost = vi.fn();
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? Response.json({ error: 'forbidden' }, { status })
      : Response.json(initial),
  );
  render(<ContentOwners householdId="linden" onAccessLost={lost} />);
  await choose();
  await confirm();
  expect(lost).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText('Historisk innehållsidentitet')).toBeNull();
});

test('an initial failed read remains retryable without claiming an assignment', async () => {
  let first = true;
  vi.stubGlobal('fetch', async () => {
    if (first) {
      first = false;
      throw new TypeError('offline');
    }
    return Response.json(initial);
  });
  render(<ContentOwners householdId="linden" onAccessLost={vi.fn()} />);
  await load();
  expect((await screen.findByRole('alert')).textContent).toContain('kunde inte hämtas');
  await load();
  expect(screen.getByLabelText('Historisk innehållsidentitet')).toBeDefined();
  expect(screen.queryByText('Innehållskopplingen är sparad.')).toBeNull();
});
