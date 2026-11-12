import { once } from 'node:events';
import { connect } from 'node:net';
import { signIn } from '../../support/client.js';
import { expect, test } from '../../support/http-test.js';
import { createInstallation } from '../../support/installation.js';

for (const action of ['restart', 'close'] as const) {
  test(`installation ${action} releases a browser preconnection without an HTTP request`, async ({
    request,
  }) => {
    const installation = await createInstallation();
    const socket = connect(Number(new URL(installation.origin).port), '127.0.0.1');
    await once(socket, 'connect');
    const stopped = installation[action]();
    try {
      await expect.poll(() => socket.destroyed).toBe(true);
      await stopped;
      if (action === 'restart')
        expect((await request.get(`${installation.origin}/healthz`)).status()).toBe(200);
    } finally {
      socket.destroy();
      await stopped;
      if (action === 'restart') await installation.close();
    }
  });
}

test('installation restart drains an admitted HTTP response before closing its connections', async ({
  request,
}) => {
  let entered!: () => void;
  const admitted = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let release!: () => void;
  const delivery = new Promise<void>((resolve) => {
    release = resolve;
  });
  const installation = await createInstallation(undefined, {
    deliverResponse: async (request, response) => {
      if (new URL(request.url).pathname === '/healthz') {
        entered();
        await delivery;
      }
      return response;
    },
  });
  const socket = connect(Number(new URL(installation.origin).port), '127.0.0.1');
  let stopped: Promise<void> | undefined;
  try {
    await once(socket, 'connect');
    const preconnectionClosed = once(socket, 'close');
    const response = request.get(`${installation.origin}/healthz`).then(
      (response) => ({ response }),
      (error: unknown) => ({ error }),
    );
    await admitted;
    stopped = installation.restart();
    // Closing the unused connection proves shutdown has started while the
    // admitted response is still deliberately held at the delivery boundary.
    await preconnectionClosed;
    release();
    const result = await response;
    if ('error' in result) throw result.error;
    expect(result.response.status()).toBe(200);
    await stopped;
  } finally {
    release();
    socket.destroy();
    await stopped;
    await installation.close();
  }
});

test('installation restart lets an aborted authentication handler finish using its database', async ({
  request,
}) => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((complete) => {
      resolve = complete;
    });
    return { promise, resolve };
  }
  const witness = deferred<AbortSignal>();
  const witnessDelivery = deferred<void>();
  const callbackResponse = deferred<Response>();
  const callbackDelivery = deferred<void>();
  let callbackFinished = false;
  let prematureRestart = false;
  let callbackUrl: string | undefined;
  const installation = await createInstallation(undefined, {
    deliverResponse: async (request, response) => {
      if (request.url === callbackUrl) {
        callbackResponse.resolve(response);
        await callbackDelivery.promise;
        callbackFinished = true;
      }
      if (new URL(request.url).pathname === '/healthz') {
        witness.resolve(request.signal);
        await witnessDelivery.promise;
      }
      return response;
    },
  });
  const port = Number(new URL(installation.origin).port);
  const connection = connect(port, '127.0.0.1');
  const preconnection = connect(port, '127.0.0.1');
  let stopped: Promise<void> | undefined;
  let resume = () => {};
  try {
    await Promise.all([once(connection, 'connect'), once(preconnection, 'connect')]);
    await signIn(request, installation.origin);
    const login = await request.post(`${installation.origin}/api/auth/sign-in/social`, {
      headers: { origin: installation.origin },
      data: { provider: 'google', callbackURL: '/' },
    });
    expect(login.status()).toBe(200);
    callbackUrl = (await login.json()).url;
    if (!callbackUrl) throw new Error('Missing authentication callback URL');
    const callback = new URL(callbackUrl);
    const cookies = (await request.storageState()).cookies
      .map(({ name, value }) => `${name}=${value}`)
      .join('; ');
    const paused = installation.pauseNextProvider();
    resume = paused.resume;
    connection.write(
      `GET ${callback.pathname}${callback.search} HTTP/1.1\r\nHost: ${callback.host}\r\nCookie: ${cookies}\r\n\r\n` +
        `GET /healthz HTTP/1.1\r\nHost: ${callback.host}\r\n\r\n`,
    );
    await paused.reached;
    const signal = await witness.promise;
    const aborted = new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
    connection.destroy();
    // The pipelined request witnesses server-side abort of the same connection.
    await aborted;
    witnessDelivery.resolve();
    const preconnectionClosed = once(preconnection, 'close');
    stopped = installation.restart().then(() => {
      prematureRestart = !callbackFinished;
    });
    await preconnectionClosed;
    resume();
    const response = await callbackResponse.promise;
    expect(response.status).toBe(302);
    const location = response.headers.get('location');
    if (!location) throw new Error('Missing authentication redirect');
    const destination = new URL(location, installation.origin);
    expect(destination.origin).toBe(installation.origin);
    expect(destination.pathname).toBe('/');
    expect(destination.searchParams.get('loginConfirmation')).toBeTruthy();
    expect(destination.searchParams.has('error')).toBe(false);
    expect(destination.searchParams.has('authError')).toBe(false);
    callbackDelivery.resolve();
    await stopped;
    expect(prematureRestart).toBe(false);
  } finally {
    resume();
    witnessDelivery.resolve();
    callbackDelivery.resolve();
    connection.destroy();
    preconnection.destroy();
    await stopped;
    await installation.close();
  }
});
