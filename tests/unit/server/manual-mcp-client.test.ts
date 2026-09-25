import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { request } from '@playwright/test';
import { expect, test } from 'vitest';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';

test('manual MCP controls authenticate independently, retain stale requests and recover a dropped receipt after restart', async () => {
  const app = await createInstallation();
  const browser = await request.newContext();
  const child = spawn(process.execPath, [
    '--import',
    'tsx',
    'scripts/manual-mcp-client.ts',
    app.origin,
    '0',
  ]);
  const events: ReturnType<typeof JSON.parse>[] = [];
  let output = '';
  let exited = false;
  child.once('exit', () => {
    exited = true;
  });
  child.stdout.on('data', (data) => {
    output += data;
  });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    events.push(JSON.parse(line));
  });
  async function next(event: string) {
    await expect
      .poll(() => events.some((item) => item.event === event || item.event === 'error') || exited, {
        timeout: 10_000,
      })
      .toBe(true);
    const index = events.findIndex((item) => item.event === event);
    expect(index, output).toBeGreaterThanOrEqual(0);
    return events.splice(index, 1)[0];
  }
  async function command(line: string, event = 'result') {
    child.stdin.write(`${line}\n`);
    return next(event);
  }
  try {
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const authorization = await next('authorize');
    const url = new URL(authorization.url);
    expect(url.searchParams.get('scope')).toBe('skyttel:read skyttel:write');
    const callback = new URL(url.searchParams.get('redirect_uri') ?? 'missing');
    callback.searchParams.set('state', 'wrong-state');
    callback.searchParams.set('code', 'do-not-log-this-code');
    expect((await fetch(callback)).status).toBe(400);
    const wrongPath = new URL(callback);
    wrongPath.pathname = '/wrong';
    wrongPath.searchParams.set('state', url.searchParams.get('state') ?? 'missing');
    expect((await fetch(wrongPath)).status).toBe(400);
    expect((await fetch(callback, { headers: { host: 'example.test' } })).status).toBe(400);
    const authorizeResponse = await browser.get(authorization.url, { maxRedirects: 0 });
    const consentUrl = new URL(authorizeResponse.headers().location, app.origin);
    const consent = await browser.post(`${app.origin}/api/assistants/consent`, {
      headers: { origin: app.origin },
      data: {
        accept: true,
        externalAi: true,
        mapWork: true,
        householdId: household.id,
        oauth_query: consentUrl.search.slice(1),
      },
    });
    expect(consent.status()).toBe(200);
    expect((await fetch((await consent.json()).url)).status).toBe(200);
    await next('ready');
    const mapPath = `${app.origin}/api/households/${household.id}/map`;
    async function propose(name: string) {
      const state = await (await browser.get(mapPath)).json();
      const response = await browser.post(`${mapPath}/draft`, {
        headers: { origin: app.origin },
        data: {
          version: state.draft.version,
          contentVersion: state.contentVersion,
          id: name,
          baseRevision: null,
          value: { typeId: state.types[0].id, name, description: '' },
        },
      });
      expect(response.status()).toBe(200);
    }
    await propose('Lo');
    const old = await command('capture-save old', 'captured');
    await propose('Kim');
    const stale = await command('send old');
    expect(stale.value.error).toBe('draft_conflict');
    expect(stale.value.review.changes).toHaveLength(2);
    expect((await (await browser.get(mapPath)).json()).objects).toEqual([]);
    const captured = await command('capture-save recovery', 'captured');
    expect(captured.arguments.operationId).not.toBe(old.arguments.operationId);
    expect(await command('drop recovery', 'response-dropped')).toMatchObject({
      outcome: 'unknown',
    });
    expect(output).not.toContain('"receipt"');
    await app.restart();
    const recovered = await command('status recovery');
    expect(recovered.value.operation.status).toBe('succeeded');
    const retried = await command('send recovery');
    expect(retried.value.receipt).toEqual(recovered.value.operation.receipt);
    expect((await (await browser.get(`${mapPath}/history`)).json()).history).toEqual([
      retried.value.receipt,
    ]);
    const object = JSON.stringify({
      id: 'manual-bank',
      type: 'Bankkonto',
      name: 'Betalkonto',
      identity: 'unresolved',
    });
    await command(`capture-object bank ${object}`, 'captured');
    await command('send bank');
    await command(
      `capture-object other ${JSON.stringify({ id: 'manual-other', type: 'Bankkonto', name: 'Hushållskonto' })}`,
      'captured',
    );
    await command('send other');
    await command('capture-save unresolved', 'captured');
    const unresolved = await command('send unresolved');
    expect(unresolved.value.error).toBe('unresolved_identity');
    expect(unresolved.value.review.changes).toHaveLength(2);
    expect((await (await browser.get(mapPath)).json()).objects).toHaveLength(2);
    await command(
      `capture-object specified ${JSON.stringify({ id: 'manual-bank', type: 'Bankkonto', name: 'Betalkonto', identity: 'unspecified' })}`,
      'captured',
    );
    await command('send specified');
    await command(
      `capture-object delayed ${JSON.stringify({ id: 'manual-other', type: 'Bankkonto', name: 'Hushållskonto' })}`,
      'captured',
    );
    await command('discard manual-other');
    expect((await command('send delayed')).value.error).toBe('draft_conflict');
    await command('capture-save specified-save', 'captured');
    const saved = await command('send specified-save');
    expect(saved.value.receipt.changes).toHaveLength(1);
    expect(saved.value.receipt.changes[0].after.identity).toBe('unspecified');
    const tools = await command('tools');
    expect(tools.value.tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'propose_undo' })]),
    );
    const receiptReference = JSON.stringify({
      operationId: saved.value.receipt.operationId,
      userId: saved.value.receipt.userId,
    });
    const history = await command(`read-tool read_history ${receiptReference}`);
    expect(history.value.receipt).toEqual(saved.value.receipt);
    const undo = await command(`capture-tool undo propose_undo ${receiptReference}`, 'captured');
    expect(undo.arguments).toMatchObject(JSON.parse(receiptReference));
    const beforeUndo = await command('read');
    expect(beforeUndo.value.changes).toEqual([]);
    await propose('Intervening');
    expect((await command('send undo')).value.error).toBe('draft_conflict');
    expect(
      await command(`capture-tool undo propose_undo ${receiptReference}`, 'error'),
    ).toMatchObject({ message: expect.stringContaining('never overwritten') });
    await command(`capture-tool current-undo propose_undo ${receiptReference}`, 'captured');
    const proposedUndo = await command('send current-undo');
    expect(proposedUndo.value.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'manual-bank', after: null }),
        expect.objectContaining({ id: 'Intervening' }),
      ]),
    );
    // Generic controls cannot send writes as reads, bypass save recovery, or
    // replace the authenticated scope and automatically captured versions.
    for (const invalid of [
      `read-tool propose_undo ${receiptReference}`,
      'capture-tool wrong-read read_history {}',
      'capture-tool wrong-save save_draft {}',
      'capture-tool wrong-prepare prepare_save {}',
      'capture-tool wrong-admin erase_household {}',
      'capture-tool wrong-version propose_undo {"version":0}',
      'capture-tool wrong-content propose_undo {"contentVersion":1}',
      'capture-tool wrong-actor propose_undo {"actorId":"another"}',
      'read-tool read_history {"householdId":"another"}',
      'read-tool read_history []',
      'capture-tool wrong-json propose_undo null',
    ]) {
      expect(await command(invalid, 'error')).toHaveProperty('message');
    }
    expect((await command('read')).value).toEqual(proposedUndo.value);
    expect((await (await browser.get(mapPath)).json()).objects).toHaveLength(3);
    const connections = await (await browser.get(`${app.origin}/api/assistants/context`)).json();
    expect(connections.connections).toHaveLength(1);
    const revoked = await browser.post(
      `${app.origin}/api/assistants/${connections.connections[0].id}/revoke`,
      { headers: { origin: app.origin } },
    );
    expect(revoked.ok()).toBe(true);
    expect(await command('read', 'error')).toMatchObject({ message: 'MCP HTTP 401' });
    await command('quit', 'closed');
    expect(output).not.toMatch(/do-not-log-this-code|access_token|refresh_token|Bearer /);
  } finally {
    child.kill('SIGTERM');
    lines.close();
    await browser.dispose();
    await app.close();
  }
});
