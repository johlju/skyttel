import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { afterEach, expect, test, vi } from 'vitest';
import {
  clientAddressBoundary,
  clientAddressHeader,
  trustedPeerList,
} from '../../../src/server/client-address.js';

function bindings(peer: string | undefined) {
  const socket = new Socket();
  Object.defineProperty(socket, 'remoteAddress', { value: peer });
  const incoming = new IncomingMessage(socket);
  return { incoming, outgoing: new ServerResponse(incoming) };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test('direct mode replaces spoofed headers and preserves the request body', async () => {
  const handle = vi.fn(async (request: Request) => {
    expect(request.headers.get(clientAddressHeader)).toBe('192.0.2.10');
    expect(request.method).toBe('POST');
    expect(await request.text()).toBe('synthetic-body');
    return new Response('handled');
  });
  const request = new Request('http://localhost/api/auth/sign-in/social', {
    method: 'POST',
    headers: {
      [clientAddressHeader]: '198.51.100.99',
      'x-forwarded-for': '198.51.100.88',
    },
    body: 'synthetic-body',
  });
  const response = await clientAddressBoundary({ mode: 'direct' }, handle)(
    request,
    bindings('192.0.2.10'),
  );
  expect(await response.text()).toBe('handled');
  expect(handle).toHaveBeenCalledOnce();
  expect(request.headers.get(clientAddressHeader)).toBe('198.51.100.99');
});

test.each([
  ['peers', '192.0.2.10', '198.51.100.20'],
  ['peers', '2001:db8::10', '2001:db8:1::20'],
  ['protected-origin', '203.0.113.10', '198.51.100.20'],
] as const)(
  '%s ingress accepts its authoritative address through %s',
  async (trust, peer, address) => {
    const handle = vi.fn((request: Request) => {
      expect(request.headers.get(clientAddressHeader)).toBe(address);
      return new Response('handled');
    });
    const boundary = clientAddressBoundary(
      { mode: 'header', header: 'x-client-ip', trust, peers: ['192.0.2.0/24', '2001:db8::/48'] },
      handle,
    );
    expect(
      (
        await boundary(
          new Request('http://localhost/api/auth/get-session', {
            headers: { 'x-client-ip': address, [clientAddressHeader]: '198.51.100.99' },
          }),
          bindings(peer),
        )
      ).status,
    ).toBe(200);
    expect(handle).toHaveBeenCalledOnce();
  },
);

test.each([
  [undefined, '198.51.100.20', 'missing_peer'],
  ['not-an-address', '198.51.100.20', 'missing_peer'],
  ['fe80::1%eth0', '198.51.100.20', 'missing_peer'],
  ['203.0.113.10', '198.51.100.20', 'untrusted_peer'],
  ['192.0.2.10', undefined, 'missing_header'],
  ['192.0.2.10', '', 'invalid_header'],
  ['192.0.2.10', 'not-an-address', 'invalid_header'],
  ['192.0.2.10', '198.51.100.20, 203.0.113.1', 'invalid_header'],
  ['192.0.2.10', 'fe80::1%eth0', 'invalid_header'],
])('rejects authentication with peer %s and header %s', async (peer, address, reason) => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const handle = vi.fn(() => new Response('should not run'));
  const boundary = clientAddressBoundary(
    { mode: 'header', header: 'x-client-ip', trust: 'peers', peers: ['192.0.2.0/24'] },
    handle,
  );
  const headers = new Headers({ [clientAddressHeader]: '198.51.100.99' });
  if (address !== undefined) headers.set('x-client-ip', address);
  const response = await boundary(
    new Request('http://localhost/api/auth/get-session', { headers }),
    bindings(peer),
  );
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ error: 'service_unavailable' });
  expect(handle).not.toHaveBeenCalled();
  expect(warn.mock.calls).toEqual([
    [JSON.stringify({ event: 'auth_client_address_unavailable', reason })],
  ]);
});

test.each([
  '/api/auth/get-session',
  '/api/%61uth/get-session',
  '/api/assistants/consent',
  '/.well-known/oauth-authorization-server/api/auth',
])('protects authentication path %s without a peer', async (path) => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const handle = vi.fn(() => new Response('should not run'));
  const response = await clientAddressBoundary({ mode: 'direct' }, handle)(
    new Request(`http://localhost${path}`),
    bindings(undefined),
  );
  expect(response.status).toBe(503);
  expect(handle).not.toHaveBeenCalled();
});

test('unavailable addresses allow health checks without retaining caller-supplied internal data', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const handle = vi.fn((request: Request) => {
    expect(request.headers.has(clientAddressHeader)).toBe(false);
    return new Response('healthy');
  });
  clientAddressBoundary({ mode: 'direct' }, handle)(
    new Request('http://localhost/healthz', { headers: { [clientAddressHeader]: '192.0.2.10' } }),
    bindings(undefined),
  );
  expect(handle).toHaveBeenCalledOnce();
  expect(warn).not.toHaveBeenCalled();
});

test('logs an address-free diagnostic at most once per minute and resumes after the interval', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const boundary = clientAddressBoundary({ mode: 'direct' }, () => new Response());
  const request = new Request('http://localhost/api/auth/get-session');
  boundary(request, bindings(undefined));
  vi.advanceTimersByTime(59_999);
  boundary(request, bindings(undefined));
  expect(warn).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);
  boundary(request, bindings(undefined));
  expect(warn.mock.calls).toEqual(
    Array.from({ length: 2 }, () => [
      JSON.stringify({ event: 'auth_client_address_unavailable', reason: 'missing_peer' }),
    ]),
  );
});

test('peer allowlists distinguish exact hosts and IPv4/IPv6 network boundaries', () => {
  const peers = trustedPeerList([
    '192.0.2.10',
    '198.51.100.0/24',
    '2001:db8::10',
    '2001:db8:1::/48',
  ]);
  for (const address of ['192.0.2.10', '198.51.100.255']) expect(peers.check(address)).toBe(true);
  for (const address of ['192.0.2.11', '198.51.101.1']) expect(peers.check(address)).toBe(false);
  for (const address of ['2001:db8::10', '2001:db8:1:ffff::1'])
    expect(peers.check(address, 'ipv6')).toBe(true);
  for (const address of ['2001:db8::11', '2001:db8:2::1'])
    expect(peers.check(address, 'ipv6')).toBe(false);
});

test.each([
  'not-an-address',
  'fe80::1%eth0',
  '192.0.2.1/24/1',
  '192.0.2.1/no',
  '192.0.2.1/33',
  '::1/129',
])('rejects invalid peer declaration %s', (peer) =>
  expect(() => trustedPeerList([peer])).toThrow('invalid_peer'),
);
