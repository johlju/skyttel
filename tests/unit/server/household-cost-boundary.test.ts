import { request } from '@playwright/test';
import { unzipSync } from 'fflate';
import { expect, test } from 'vitest';
import { createHousehold, signIn } from '../../support/client.js';
import { costProvider } from '../../support/cost-provider.js';
import { createInstallation } from '../../support/installation.js';

test('current household archives reimport without replacing or transferring installation usage', async () => {
  const model = costProvider();
  const source = await createInstallation(undefined, { modelFetch: model.provider });
  const target = await createInstallation();
  const owner = await request.newContext();
  const recipient = await request.newContext();
  try {
    await signIn(owner, source.origin);
    const { household } = await (await createHousehold(owner, source.origin)).json();
    const path = `${source.origin}/api/households/${household.id}`;
    const headers = { origin: source.origin };
    const assistant = await (
      await owner.post(`${path}/text-assistant`, {
        headers,
        data: { externalAi: true, mapWork: true },
      })
    ).json();
    expect(
      (
        await owner.post(`${path}/text-assistant/${assistant.id}/messages`, {
          headers,
          data: {
            revision: 0,
            draftVersion: 0,
            contentVersion: 1,
            requestId: 'archive-cost',
            text: 'Prova kostnad utan hushållsinnehåll.',
          },
        })
      ).status(),
    ).toBe(202);
    const month = new Date().toISOString().slice(0, 7);
    const costPath = `/api/operator/costs?month=${month}`;
    await expect
      .poll(
        async () =>
          (await (await owner.get(`${source.origin}${costPath}`)).json()).terra.estimatedUsd,
      )
      .toBe(0.229);
    const before = await (await owner.get(`${source.origin}${costPath}`)).json();
    const prepared = await (await owner.post(`${path}/exports`, { headers, data: {} })).json();
    const archive = await (await owner.get(`${path}/exports/${prepared.id}`)).body();
    const parts = unzipSync(archive);
    expect(Object.keys(parts).sort()).toEqual(['content.json', 'images.bin', 'manifest.json']);
    const manifest = JSON.parse(new TextDecoder().decode(parts['manifest.json']));
    expect(manifest.schemaVersion).toBe(16);
    const serialized = new TextDecoder().decode(parts['content.json']);
    expect(serialized).not.toMatch(
      /cost_attempt|cost_assumptions|cost_coverage|ratesJSON|gpt-5\.6-terra/,
    );
    await signIn(recipient, target.origin);
    const destination = await (await createHousehold(recipient, target.origin)).json();
    for (const [client, origin, householdId] of [
      [owner, source.origin, household.id],
      [recipient, target.origin, destination.household.id],
    ] as const) {
      const destinationPath = `${origin}/api/households/${householdId}`;
      const imported = await client.post(`${destinationPath}/imports`, {
        headers: { origin, 'content-type': 'application/zip', 'X-Skyttel-Content-Version': '1' },
        data: archive,
      });
      expect(imported.status(), await imported.text()).toBe(201);
      const ready = await imported.json();
      const confirmed = await client.post(`${destinationPath}/imports/${ready.id}/confirm`, {
        headers: { origin },
        data: { contentVersion: 1, confirmed: true },
      });
      expect(await confirmed.json()).toMatchObject({ status: 'completed', contentVersion: 2 });
    }
    const preserved = await (await owner.get(`${source.origin}${costPath}`)).json();
    expect(preserved.terra).toEqual(before.terra);
    expect(preserved.coverageStartedAt).toBe(before.coverageStartedAt);
    const replacement = await (await recipient.get(`${target.origin}${costPath}`)).json();
    expect(replacement.terra.attempts).toBe(0);
    expect(replacement.live.attempts).toBe(0);
    expect(replacement.coverageIncomplete).toBe(true);
    expect(replacement.total.incomplete).toBe(true);
  } finally {
    await owner.dispose();
    await recipient.dispose();
    await source.close();
    await target.close();
  }
});
