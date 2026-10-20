import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createManualTransport } from '../../scripts/manual-transport-control.js';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';

for (const seeded of [false, true]) {
  test(`workspace preparation holds completed personal reads and moves on ${seeded ? 'seeded' : 'empty'} content`, {
    tag: '@technical',
  }, async ({ request }) => {
    const app = await createInstallation();
    let transport: Awaited<ReturnType<typeof createManualTransport>> | undefined;
    try {
      await signIn(request, app.origin);
      const { household } = await (await createHousehold(request, app.origin)).json();
      const path = `${app.origin}/api/households/${household.id}/map`;
      const headers = { origin: app.origin };
      const read = async (): Promise<MapState> => (await request.get(path)).json();
      const empty = await read();
      if (seeded) {
        expect(
          (
            await request.post(`${path}/draft`, {
              headers,
              data: {
                version: empty.draft.version,
                id: 'lamp',
                baseRevision: null,
                value: {
                  name: 'Lampan',
                  typeId: empty.types[0].id,
                  properties: [
                    {
                      id: 'description',
                      label: 'Beskrivning',
                      kind: 'text' as const,
                      value: 'Sparad provlampa',
                    },
                  ],
                },
              },
            })
          ).ok(),
        ).toBe(true);
        expect(
          (
            await request.post(`${path}/save`, {
              headers,
              data: {
                version: (await read()).draft.version,
                operationId: 'workspace-preparation-fixture',
              },
            })
          ).ok(),
        ).toBe(true);
      }
      const before = await read();
      const history = (await (await request.get(`${path}/history`)).json()).history;
      const personal = await (await request.get(`${path}/view`)).json();
      const events: { phase: string; route?: string; status?: number }[] = [];
      transport = await createManualTransport({
        publicOrigin: app.origin,
        upstreamOrigin: app.origin,
        householdId: household.id,
        report: (event) => events.push(event),
      });
      const proxy = transport;
      const host = new URL(app.origin).host;
      // Request storage carries the ordinary authenticated cookie. Host stays public.
      const cookie = (await request.storageState()).cookies
        .map(({ name, value }) => `${name}=${value}`)
        .join('; ');
      const proxyHeaders = { ...headers, host, cookie };
      proxy.command('arm read-view:after');
      let delivered = false;
      const heldRead = request
        .get(`${proxy.address}/api/households/${household.id}/map/view`, { headers: proxyHeaders })
        .then((response) => {
          delivered = true;
          return response;
        });
      await expect
        .poll(() => events.at(-1))
        .toEqual({ phase: 'held-after', route: 'read-view', status: 200 });
      expect(delivered).toBe(false);
      expect(await read()).toEqual(before);
      proxy.command('release');
      expect(await (await heldRead).json()).toEqual(personal);
      await expect.poll(() => proxy.command('status').active).toBeUndefined();
      expect(
        (
          await request.get(`${proxy.address}/api/households/${household.id}/map/view`, {
            headers: proxyHeaders,
          })
        ).ok(),
      ).toBe(true);

      proxy.command('arm position:after');
      const move = request.post(
        `${proxy.address}/api/households/${household.id}/map/view/position`,
        {
          headers: proxyHeaders,
          data: { id: 'lamp', version: 0, position: { x: 2, y: 3, z: 4 } },
        },
      );
      await expect.poll(() => events.at(-1)?.phase).toBe('held-after');
      expect(events.at(-1)?.route).toBe('position');
      const actual = await (await request.get(`${path}/view`)).json();
      if (seeded) {
        expect(events.at(-1)?.status).toBe(200);
        expect(actual.positions).toEqual([{ id: 'lamp', version: 1, x: 2, y: 3, z: 4 }]);
      } else {
        expect(events.at(-1)?.status).toBe(400);
        expect(actual).toEqual(personal);
      }
      expect(await read()).toEqual(before);
      expect((await (await request.get(`${path}/history`)).json()).history).toEqual(history);
      proxy.command('release');
      expect((await move).status()).toBe(seeded ? 200 : 400);
      await expect.poll(() => proxy.command('status').active).toBeUndefined();
      proxy.command('arm read:before');
      const absent = request
        .get(`${proxy.address}/api/households/${household.id}/map`, { headers: proxyHeaders })
        .catch((error) => error);
      await expect.poll(() => events.at(-1)?.phase).toBe('held-before');
      proxy.command('drop');
      await absent;
      await expect.poll(() => proxy.command('status').active).toBeUndefined();
      expect(
        (
          await request.get(`${proxy.address}/api/households/${household.id}/map`, {
            headers: proxyHeaders,
          })
        ).ok(),
      ).toBe(true);
      expect(await read()).toEqual(before);
      proxy.command('arm read-view:before');
      proxy.command('clear');
      expect(proxy.command('status')).toEqual({
        armed: undefined,
        active: undefined,
        held: undefined,
      });
      // Exercise the documented launcher and exact command vocabulary as well.
      const reservation = createServer();
      await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve));
      const address = reservation.address();
      if (!address || typeof address === 'string') throw new Error('A loopback port is required');
      const port = address.port;
      await new Promise<void>((resolve, reject) =>
        reservation.close((error) => (error ? reject(error) : resolve())),
      );
      const child = spawn(
        process.execPath,
        [
          '--import',
          'tsx',
          'scripts/manual-transport.ts',
          '--origin',
          app.origin,
          '--upstream',
          app.origin,
          '--household',
          household.id,
          '--port',
          String(port),
        ],
        { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: undefined } },
      );
      const output: { phase?: string; route?: string; status?: number }[] = [];
      let buffer = '';
      let diagnostics = '';
      child.stderr.on('data', (chunk) => {
        diagnostics += String(chunk);
      });
      child.stdout.on('data', (chunk) => {
        buffer += String(chunk);
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) if (line.startsWith('{')) output.push(JSON.parse(line));
      });
      try {
        await expect
          .poll(() => output.some((event) => event.phase === 'ready'), { message: diagnostics })
          .toBe(true);
        const beforeArm = output.length;
        child.stdin.write('arm read-view:after\n');
        await expect.poll(() => output.length).toBeGreaterThan(beforeArm);
        const launched = request.get(
          `http://127.0.0.1:${port}/api/households/${household.id}/map/view`,
          { headers: proxyHeaders },
        );
        await expect
          .poll(() =>
            output.some((event) => event.phase === 'held-after' && event.route === 'read-view'),
          )
          .toBe(true);
        child.stdin.write('release\n');
        expect(await (await launched).json()).toEqual(actual);
        child.stdin.write('quit\n');
        await expect.poll(() => child.exitCode).toBe(0);
        expect(output.some((event) => event.phase === 'closed')).toBe(true);
        expect(diagnostics).toBe('');
      } finally {
        if (child.exitCode === null) {
          child.kill('SIGTERM');
          await new Promise<void>((resolve) => child.once('exit', () => resolve()));
        }
      }
    } finally {
      await transport?.close();
      await app.close();
    }
  });
}
