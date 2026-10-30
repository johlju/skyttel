import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { HouseholdMap } from '../../src/client/HouseholdMap.js';
import '../../src/client/styles.css';
import type { MapState } from '../../src/shared/map.js';
import { defaultViewSettings } from '../../src/shared/personal-view.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('YTA-13: samtalshjälpen visar macOS-text före medgivande och återför fokus', async () => {
  await page.viewport(1280, 720);
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
  const microphone = vi.spyOn(navigator.mediaDevices, 'getUserMedia');
  const requests: { url: string; method: string }[] = [];
  const state: MapState = {
    userId: 'alex',
    contentVersion: 0,
    types: [],
    relationshipTypes: [],
    relationships: [],
    objects: [],
    draft: { version: 0, changes: [] },
  };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    requests.push({ url, method: init?.method ?? 'GET' });
    if (url.endsWith('/view'))
      return Response.json({
        contentVersion: 0,
        positions: [],
        settings: { ...defaultViewSettings, version: 0 },
      });
    if (url.endsWith('/operations')) return Response.json({ operations: [] });
    if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
    if (url.endsWith('/text-assistant')) return Response.json({ available: true });
    if (url.includes('/map?')) return Response.json(state);
    throw new Error(`Unexpected help request: ${url}`);
  });
  render(
    <main>
      <section className="panel household-panel">
        <HouseholdMap householdId="home" />
      </section>
    </main>,
  );
  await expect.element(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
  const button = page.getByRole('button', { name: 'Information och hjälp', exact: true });
  const help = page.getByRole('region', { name: 'Information och hjälp', exact: true });
  button.element().focus();
  await userEvent.keyboard('{Enter}');
  await expect
    .element(help.getByRole('heading', { name: 'Information och hjälp', exact: true }))
    .toHaveFocus();
  const text = (help.element() as HTMLElement).innerText;
  expect(text).toContain('Röst och text är samma samtal');
  expect(text).toContain('Kartans teckenförklaring');
  expect(text).toContain('rött × och streckad linje');
  expect(text).toContain('samma riktade ändpunkter');
  expect(text).toContain('Punktade kopplingar');
  expect(text).toContain('Höjdhjälpens streckade markeringar');
  expect(text).toContain('separat ring');
  expect(text).toContain('tre sekunder');
  expect(text).toContain('Släpp stänger av ny inspelning direkt');
  expect(text).toContain('även efter släpp');
  expect(text).toContain('Ctrl+Skift+Mellanslag');
  expect(text).toContain('Kort tryck räcker alltid');
  expect(text).toContain('Skyttel kan höra och förstå fel');
  expect(text).toContain('samtalstexten kan innehålla fel');
  expect(text).toContain('hela ditt utkast');
  expect(text).toContain('exakt samtalstext');
  expect(text).toContain('hushållets verktygsförfrågningar och resultat');
  expect(text).toContain('Rått ljud och tekniska autentiseringsuppgifter ingår inte');
  expect(text).toContain('Ditt samtalsmedgivande är ett separat val');
  expect(text).toContain('rullande 14 dagars grundlagring');
  expect(text).toContain('Radering i molnet är separat');
  expect(text).toContain('Återkalla och avsluta samtalet');
  expect(text).toContain('Skyttel begär att OpenAI inte lagrar samtalet');
  expect(text).toContain('loggar för att förebygga missbruk');
  expect(text).toContain('inte behandling enbart i EU eller omedelbar radering');
  expect(text).toContain('Kartans formulär finns kvar som alternativ till samtalet');
  expect(text).toContain('Välj Tabell');
  expect(text).toContain('Välj Skriv till Skyttel och Visa utkastet');
  expect(text).toContain('Genomförda sparanden finns under Rapporter, Ändringshistorik');
  expect(text).toContain('oskickade samtalsmeddelande finns kvar');
  expect(text).toContain('Fortsätt redigera behåller formulärändringarna');
  expect(text).toContain('Kasta ändringarna och fortsätt kastar bara');
  expect(text).not.toMatch(/Välj Lista|Utkast och historik|Tidigare sparförsök/);
  expect(text).not.toMatch(/talsamtal|textassistent|assistenten|kontextfönster|store:|API/i);
  await expect
    .element(help.getByRole('link', { name: 'Läs OpenAI:s datavillkor', exact: true }))
    .toHaveAttribute('href', 'https://developers.openai.com/api/docs/guides/your-data');
  expect(microphone).not.toHaveBeenCalled();
  expect(requests.filter((request) => request.method !== 'GET')).toEqual([]);
  expect(requests.some((request) => request.url.endsWith('/voice'))).toBe(false);
  await userEvent.keyboard('{Escape}');
  await expect.element(help).not.toBeInTheDocument();
  await expect.element(button).toHaveFocus();
  await button.click();
  await expect
    .element(help.getByRole('heading', { name: 'Information och hjälp', exact: true }))
    .toHaveFocus();
  await help.getByRole('button', { name: 'Stäng verktyget', exact: true }).click();
  await expect.element(help).not.toBeInTheDocument();
  await expect.element(button).toHaveFocus();
});
