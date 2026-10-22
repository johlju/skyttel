import { BlockList, isIP } from 'node:net';
import type { Http2Bindings, HttpBindings } from '@hono/node-server';
import { getPath } from 'hono/utils/url';

export type ClientAddressPolicy =
  | { mode: 'direct' }
  | { mode: 'header'; header: string; trust: 'protected-origin' }
  | { mode: 'header'; header: string; trust: 'peers'; peers: string[] };

// Only the Node boundary writes this header; caller values are always removed.
export const clientAddressHeader = 'x-skyttel-client-address';

export function trustedPeerList(peers: string[]) {
  const list = new BlockList();
  for (const peer of peers) {
    const [address, prefix, extra] = peer.split('/');
    const family = isIP(address);
    if (!family || address.includes('%') || extra !== undefined) throw new Error('invalid_peer');
    const bits = family === 4 ? 32 : 128;
    if (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > bits))
      throw new Error('invalid_peer');
    list.addSubnet(
      address,
      prefix === undefined ? bits : Number(prefix),
      family === 4 ? 'ipv4' : 'ipv6',
    );
  }
  return list;
}

/** Establish the address before any authentication route can perform work. */
export function clientAddressBoundary(
  policy: ClientAddressPolicy,
  handle: (request: Request) => Response | Promise<Response>,
) {
  const peers =
    policy.mode === 'header' && policy.trust === 'peers'
      ? trustedPeerList(policy.peers)
      : undefined;
  let nextDiagnosticAt = 0;
  return (request: Request, bindings: HttpBindings | Http2Bindings) => {
    const headers = new Headers(request.headers);
    headers.delete(clientAddressHeader);
    const peer = bindings.incoming.socket.remoteAddress;
    let address: string | undefined;
    let reason = 'missing_peer';
    if (peer && isIP(peer) && !peer.includes('%')) {
      if (policy.mode === 'direct') address = peer;
      else if (!peers || peers.check(peer, isIP(peer) === 4 ? 'ipv4' : 'ipv6')) {
        const value = headers.get(policy.header);
        if (value && isIP(value) && !value.includes('%')) address = value;
        else reason = value === null ? 'missing_header' : 'invalid_header';
      } else reason = 'untrusted_peer';
    }
    // Match the router's percent-escape handling before classifying auth paths.
    const path = getPath(request);
    const authenticates =
      path.startsWith('/api/auth/') ||
      path === '/api/assistants/consent' ||
      path === '/.well-known/oauth-authorization-server/api/auth';
    if (!address && authenticates) {
      if (Date.now() >= nextDiagnosticAt) {
        console.warn(JSON.stringify({ event: 'auth_client_address_unavailable', reason }));
        nextDiagnosticAt = Date.now() + 60_000;
      }
      return Response.json(
        { error: 'service_unavailable' },
        {
          status: 503,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }
    if (address) headers.set(clientAddressHeader, address);
    return handle(new Request(request, { headers }));
  };
}
