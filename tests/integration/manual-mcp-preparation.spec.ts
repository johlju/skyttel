import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { MapDraft, MapState } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';

test('manual MCP read-only preparation preserves empty then populated household work', {
  tag: '@technical',
}, async ({ page }) => {
  const app = await createInstallation();
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'scripts/manual-mcp-client.ts', app.origin, '0', 'read'],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const output: Record<string, unknown>[] = [];
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => output.push(JSON.parse(line)));
  const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
  async function next(command: string, event: string) {
    const before = output.length;
    child.stdin.write(`${command}\n`);
    await expect
      .poll(() => output.slice(before).find((entry) => entry.event === event))
      .toBeTruthy();
    return output.slice(before).find((entry) => entry.event === event) as Record<string, unknown>;
  }
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const path = `${app.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const before = await read();
    await expect.poll(() => output.find((entry) => entry.event === 'authorize')).toBeTruthy();
    await page.goto(String(output.find((entry) => entry.event === 'authorize')?.url));
    await page.getByLabel('Välj hushåll').selectOption(household.id);
    await expect(page.getByRole('button', { name: 'Godkänn läsåtkomst', exact: true })).toHaveCount(
      1,
    );
    await expect(
      page.getByRole('button', { name: 'Godkänn läsåtkomst', exact: true }),
    ).toBeDisabled();
    await page.getByLabel(/Jag tillåter extern AI-behandling/).check();
    await page.getByRole('button', { name: 'Godkänn läsåtkomst', exact: true }).click();
    await expect.poll(() => output.some((entry) => entry.event === 'ready')).toBe(true);
    const tools = (await next('tools', 'result')).value as { tools: { name: string }[] };
    expect(tools.tools.map((tool) => tool.name)).toEqual(['read_map', 'read_my_draft']);
    expect((await next('map', 'result')).value).toEqual({
      types: [],
      objects: [],
      contextObjects: [],
      relationshipTypes: [],
      relationships: [],
    });
    const emptyDraft = (await next('read', 'result')).value as MapDraft;
    expect(emptyDraft.changes).toEqual([]);
    expect(emptyDraft).toMatchObject({ ...before.draft });
    expect(await read()).toEqual(before);

    // Populate the authorized household through ordinary HTTP routes while
    // retaining this same read-only client and grant.
    const type = before.types.find((entry) => entry.name === 'Person');
    expect(type).toBeTruthy();
    const value = {
      typeId: type?.id,
      name: 'Alex',
      properties: [
        {
          id: 'description',
          label: 'Beskrivning',
          kind: 'text' as const,
          value: 'Sparade uppgifter om Alex',
        },
      ],
    };
    const post = async (route: string, data: object) => {
      const current = await read();
      const response = await page.request.post(`${path}/${route}`, {
        headers: { origin: app.origin },
        data: { version: current.draft.version, contentVersion: current.contentVersion, ...data },
      });
      expect(response.status(), await response.text()).toBe(200);
    };
    await post('draft', { id: 'manual-alex', baseRevision: null, value });
    await post('save', { operationId: 'manual-read-only-fixture' });
    const saved = (await read()).objects.find((entry) => entry.id === 'manual-alex');
    expect(saved).toMatchObject({ id: 'manual-alex', ...value });
    await post('draft', {
      id: 'manual-alex',
      baseRevision: saved?.revision,
      value: {
        ...value,
        properties: [
          {
            id: 'description',
            label: 'Beskrivning',
            kind: 'text' as const,
            value: 'Alex privata rättelse',
          },
        ],
      },
    });
    const populated = await read();
    const map = (await next('map', 'result')).value as { objects: unknown[] };
    expect(map.objects).toEqual([saved]);
    const draft = (await next('read', 'result')).value as MapDraft;
    expect(draft.changes).toEqual(populated.draft.changes);
    expect(draft.changes).toHaveLength(1);
    expect(draft.changes[0]).toMatchObject({
      id: 'manual-alex',
      before: saved,
      after: {
        ...value,
        properties: [
          {
            id: 'description',
            label: 'Beskrivning',
            kind: 'text' as const,
            value: 'Alex privata rättelse',
          },
        ],
      },
    });
    expect(await read()).toEqual(populated);
    await page.goto(`${app.origin}/assistants`);
    await page
      .getByRole('button', { name: 'Återkalla anslutning för Skyttel manual MCP controls' })
      .click();
    expect((await next('read', 'error')).message).toBe('MCP HTTP 401');
    await next('quit', 'closed');
    expect(await exited).toBe(0);
  } finally {
    child.kill('SIGINT');
    await exited;
    lines.close();
    await app.close();
  }
});
