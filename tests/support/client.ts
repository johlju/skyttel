import { expect, type APIRequestContext } from '@playwright/test';

export async function signIn(client: APIRequestContext, origin: string, provider = 'google') {
  const response = await client.post(`${origin}/api/auth/sign-in/social`, {
    headers: { origin },
    data: { provider, callbackURL: '/', errorCallbackURL: '/?authError=1' },
  });
  expect(response.status()).toBe(200);
  const { url } = await response.json();
  return client.get(url);
}

export async function createHousehold(client: APIRequestContext, origin: string, name = 'Hushållet Linden') {
  return client.post(`${origin}/api/households`, { headers: { origin }, data: { name } });
}
