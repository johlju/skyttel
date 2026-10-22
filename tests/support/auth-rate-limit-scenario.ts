import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { request as browserRequest } from '@playwright/test';
import { Agent, fetch as httpFetch } from 'undici';
import type { ClientAddressPolicy } from '../../src/server/client-address.js';
import { signIn } from './client.js';
import { createInstallation } from './installation.js';

assert.equal(process.env.NODE_ENV, 'production');
assert.equal(process.env.TEST, 'false');
const scenario = process.argv[2];
const policy: ClientAddressPolicy =
  scenario === 'direct'
    ? { mode: 'direct' }
    : scenario === 'protected-origin'
      ? { mode: 'header', header: 'cf-connecting-ip', trust: 'protected-origin' }
      : {
          mode: 'header',
          header: 'cf-connecting-ip',
          trust: 'peers',
          peers: [scenario === 'untrusted' ? '198.51.100.10/32' : '127.0.0.1/32'],
        };
const installation = await createInstallation(undefined, { clientAddress: policy });
const endpoint = `${installation.origin}/api/auth/jwks`;

async function request(address?: string, extra: Record<string, string> = {}) {
  const response = await fetch(endpoint, {
    headers: { ...(address === undefined ? {} : { 'cf-connecting-ip': address }), ...extra },
  });
  await response.arrayBuffer();
  return response.status;
}

async function exhaust(address?: string) {
  for (let i = 0; i < 100; i++) assert.equal(await request(address), 200);
  assert.equal(await request(address), 429);
}

try {
  if (scenario === 'encoded') {
    for (const path of [
      '/%61pi/auth/sign-in/social',
      '/api/%61uth/jwks',
      '/.well-known/oauth-authorization-server/%61pi/auth',
      '/%61pi/assistants/consent',
    ]) {
      const response = await fetch(`${installation.origin}${path}`);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'service_unavailable' });
    }
  } else if (scenario === 'missing' || scenario === 'malformed' || scenario === 'untrusted') {
    const values =
      scenario === 'missing'
        ? [undefined, undefined, undefined]
        : scenario === 'untrusted'
          ? ['192.0.2.1', '192.0.2.2']
          : [
              '',
              'not-an-ip',
              '192.0.2.1, 192.0.2.2',
              '192.0.2.1,',
              ',192.0.2.1',
              '192.0.2.1:1234',
              '[2001:db8::1]',
              'fe80::1%eth0',
            ];
    for (const value of values) {
      const response = await fetch(`${installation.origin}/api/auth/sign-in/social`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: installation.origin,
          ...(value === undefined ? {} : { 'cf-connecting-ip': value }),
          'x-forwarded-for': '192.0.2.99, 198.51.100.10',
          'x-real-ip': '192.0.2.99',
          'true-client-ip': '192.0.2.99',
          'x-skyttel-client-address': '192.0.2.99',
        },
        body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'service_unavailable' });
      assert.deepEqual(response.headers.getSetCookie(), []);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    assert.equal((await fetch(`${installation.origin}/healthz`)).status, 200);
    if (scenario !== 'untrusted') assert.equal(await request('192.0.2.1'), 200);
  } else if (scenario === 'direct') {
    await exhaust();
    assert.equal(
      await request('192.0.2.99', {
        'x-forwarded-for': '192.0.2.99',
        'x-real-ip': '192.0.2.99',
        forwarded: 'for=192.0.2.99',
        'x-skyttel-client-address': '192.0.2.99',
      }),
      429,
    );
    const other = new Agent({ localAddress: '127.0.0.2' });
    try {
      const response = await httpFetch(endpoint, { dispatcher: other });
      assert.equal(response.status, 200);
      await response.arrayBuffer();
    } finally {
      await other.close();
    }
  } else if (scenario === 'normalization') {
    await exhaust('192.0.2.1');
    assert.equal(await request('::ffff:192.0.2.1'), 429);
    assert.equal(await request('0:0:0:0:0:ffff:c000:201'), 429);
    assert.equal(await request('192.0.2.2'), 200);
    await exhaust('2001:db8:abcd:1::1');
    assert.equal(await request('2001:0DB8:abcd:0001:0000:0000:0000:0001'), 429);
    assert.equal(await request('2001:db8:abcd:1:ffff::99'), 429);
    assert.equal(await request('2001:db8:abcd:2::1'), 200);
  } else if (scenario === 'ingress') {
    // The real ingress overwrites the authoritative header and appends to an
    // unrelated chain. The client can forge either incoming header.
    const proxy = createServer(async (incoming, outgoing) => {
      assert.ok(incoming.socket.remoteAddress);
      const response = await fetch(endpoint, {
        headers: {
          'cf-connecting-ip': incoming.socket.remoteAddress,
          'x-forwarded-for': `${incoming.headers['x-forwarded-for'] ?? ''}, ${incoming.socket.remoteAddress}, 198.51.100.10`,
        },
      });
      outgoing.writeHead(response.status);
      outgoing.end(await response.text());
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const address = proxy.address();
    assert.ok(address && typeof address !== 'string');
    const proxyOrigin = `http://127.0.0.1:${address.port}`;
    const clients = ['127.0.0.2', '127.0.0.3'].map((localAddress) => new Agent({ localAddress }));
    async function throughIngress(client: number, forged: string) {
      const response = await httpFetch(`${proxyOrigin}/api/auth/jwks`, {
        dispatcher: clients[client],
        headers: { 'cf-connecting-ip': forged, 'x-forwarded-for': forged },
      });
      await response.arrayBuffer();
      return response.status;
    }
    try {
      for (let i = 0; i < 100; i++) assert.equal(await throughIngress(0, '192.0.2.99'), 200);
      assert.equal(await throughIngress(0, '203.0.113.99, 198.51.100.10'), 429);
      assert.equal(await throughIngress(1, '192.0.2.99'), 200);
      const response = await httpFetch(endpoint, {
        dispatcher: clients[0],
        headers: {
          'cf-connecting-ip': '192.0.2.99',
          'x-forwarded-for': '192.0.2.99, 127.0.0.1',
        },
      });
      assert.equal(response.status, 503);
      await response.arrayBuffer();
    } finally {
      await Promise.all(clients.map((client) => client.close()));
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    }
  } else if (scenario === 'login') {
    const client = await browserRequest.newContext({
      extraHTTPHeaders: { 'cf-connecting-ip': '192.0.2.1' },
    });
    try {
      await signIn(client, installation.origin);
      const session = await client.get(`${installation.origin}/api/auth/get-session`);
      assert.ok((await session.json()).user.id);
      for (let i = 1; i < 3; i++) {
        const response = await client.post(`${installation.origin}/api/auth/sign-in/social`, {
          headers: { origin: installation.origin },
          data: { provider: 'google', callbackURL: '/' },
        });
        assert.equal(response.status(), 200);
      }
      const blocked = await client.post(`${installation.origin}/api/auth/sign-in/social`, {
        headers: { origin: installation.origin },
        data: { provider: 'google', callbackURL: '/' },
      });
      assert.equal(blocked.status(), 429);
    } finally {
      await client.dispose();
    }
  } else {
    assert.ok(['single', 'protected-origin'].includes(scenario));
    await exhaust('192.0.2.1');
    assert.equal(
      await request('192.0.2.1', {
        'x-forwarded-for': '192.0.2.99',
        'x-real-ip': '192.0.2.99',
        'x-skyttel-client-address': '192.0.2.99',
      }),
      429,
    );
    assert.equal(await request('192.0.2.2'), 200);
  }
  console.log(`PASS ${scenario}`);
} finally {
  await installation.close();
}
