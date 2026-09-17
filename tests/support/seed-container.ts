import { chmod, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { request } from '@playwright/test';
import { createInstallation } from './installation.js';

const directory = process.argv[2];
if (!directory) throw new Error('A synthetic fixture directory is required');
await mkdir(directory, { recursive: true });
const installation = await createInstallation();
const client = await request.newContext({ baseURL: installation.origin });
try {
  const signIn = await client.post('/api/auth/sign-in/social', {
    headers: { origin: installation.origin },
    data: { provider: 'google', callbackURL: '/' },
  });
  if (!signIn.ok()) throw new Error('Synthetic sign-in failed');
  const { url } = await signIn.json();
  await client.get(url);
  const create = await client.post('/api/households', {
    headers: { origin: installation.origin },
    data: { name: 'Testhushållet Linden' },
  });
  if (create.status() !== 201) throw new Error('Synthetic household creation failed');
  const { household } = await create.json();
  const state = await client.storageState();
  const cookie = state.cookies.map((item) => `${item.name}=${item.value}`).join('; ');
  await installation.saveDatabase(join(directory, 'skyttel.sqlite'));
  // This directory contains synthetic data only and must be writable by the
  // container's unprivileged UID on Linux as well as Docker Desktop.
  await chmod(directory, 0o777);
  await chmod(join(directory, 'skyttel.sqlite'), 0o666);
  process.stdout.write(
    JSON.stringify({ cookie, householdId: household.id, householdName: household.name }),
  );
} finally {
  await client.dispose();
  await installation.close();
}
