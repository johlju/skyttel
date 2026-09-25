import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from '../../../src/client/App.js';
import { Costs } from '../../../src/client/Costs.js';
import type { CostMonth } from '../../../src/shared/costs.js';

const month = new Date().toISOString().slice(0, 7);
const sample: CostMonth = {
  month,
  generatedAt: `${month}-25T12:00:00.000Z`,
  coverageStartedAt: `${month}-01T00:00:00.000Z`,
  coverageIncomplete: false,
  recordingUnavailable: false,
  assumptions: {
    version: 1,
    updatedAt: `${month}-01T00:00:00.000Z`,
    sekPerUsd: 10,
    computeUsd: 7,
    diskGb: 1,
    diskUsdPerGb: 0.25,
    workspace: 'hobby',
    workspaceUsd: 0,
  },
  assumptionHistory: [],
  rates: [
    {
      id: 'synthetic-rates',
      checkedAt: '2026-09-25',
      liveUsdPerMinute: 0.05,
      liveMinimumSeconds: 15,
      terra: {
        threshold: 272000,
        short: { input: 2, cached: 0.2, cacheWrite: 2.5, output: 12 },
        long: { input: 4, cached: 0.4, cacheWrite: 5, output: 18 },
      },
      sources: [{ title: 'Leverantörens prislista', url: 'https://openai.com/api/pricing/' }],
    },
  ],
  render: { estimatedUsd: 7.25, estimatedSek: 72.5 },
  live: {
    attempts: 2,
    uncertainAttempts: 1,
    unpricedAttempts: 1,
    estimatedUsd: 0.0125,
    estimatedSek: 0.125,
    seconds: { known: 12, missing: 1 },
    estimatedBillableSeconds: 15,
    issues: [
      { code: 'missing_usage', count: 1 },
      { code: 'unfinished', count: 1 },
    ],
  },
  terra: {
    attempts: 1,
    uncertainAttempts: 0,
    unpricedAttempts: 0,
    estimatedUsd: 0.32,
    estimatedSek: 3.2,
    issues: [{ code: 'assumed_requested_model', count: 1 }],
    usage: {
      input: { known: 100000, missing: 0 },
      cached: { known: 10000, missing: 0 },
      cacheWrite: { known: 0, missing: 1 },
      output: { known: 10000, missing: 0 },
      reasoning: { known: 2000, missing: 0 },
    },
  },
  total: { estimatedUsd: 7.5825, estimatedSek: 75.825, incomplete: true },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test('separates full-month hosting from reported AI usage and labels missing values and partial total', async () => {
  vi.stubGlobal('fetch', async () => Response.json(sample));
  render(<Costs onAccessLost={vi.fn()} />);
  const renderCost = await screen.findByRole('region', { name: 'Render – hel månad' });
  expect(renderCost.textContent).toContain('72,50 SEK');
  const live = screen.getByRole('region', { name: 'Live – uppmätt hittills' });
  expect(live.textContent).toContain('12 sekunder rapporterade');
  expect(live.textContent).toContain('1 saknar mätvärde');
  expect(live.textContent).toContain('15 sekunder i prisuppskattningen');
  expect(live.textContent).toContain('Saknat förbrukningsunderlag: 1');
  const terra = screen.getByRole('region', { name: 'Terra – uppmätt hittills' });
  expect(terra.textContent).toContain('100 000');
  expect(terra.textContent).toContain('inklusive resonemang');
  expect(terra.textContent).toContain(
    'Begärd Terra-modell antas eftersom leverantörens modelluppgift saknas: 1',
  );
  expect(screen.getByText(/Delsumma för beräkningsbara delar/).textContent).toContain('75,83 SEK');
  expect(screen.getByText(/inte leverantörens slutliga faktura/)).toBeDefined();
  expect(screen.getByText(/200 kronor/)).toBeDefined();
  expect(
    within(screen.getByRole('region', { name: 'Prisunderlag' }))
      .getByRole('link', {
        name: 'Leverantörens prislista',
      })
      .getAttribute('href'),
  ).toBe('https://openai.com/api/pricing/');
});

test('persists only the selected month assumptions with the displayed version and keeps edits during refresh', async () => {
  const writes: unknown[] = [];
  vi.stubGlobal('fetch', async (_path: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body as string);
      writes.push(body);
      return Response.json({
        ...sample,
        assumptions: { ...body, version: 2, updatedAt: sample.generatedAt },
        assumptionHistory: [{ ...body, version: 2, updatedAt: sample.generatedAt }],
      });
    }
    return Response.json(sample);
  });
  render(<Costs onAccessLost={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Ändra månadens antaganden' }));
  const rate = screen.getByLabelText('SEK per USD');
  await userEvent.clear(rate);
  await userEvent.type(rate, '11.5');
  await userEvent.selectOptions(screen.getByLabelText('Render-arbetsyta'), 'pro');
  const workspace = screen.getByLabelText('Arbetsyta (USD/månad)');
  await userEvent.clear(workspace);
  await userEvent.type(workspace, '25');
  await userEvent.click(screen.getByRole('button', { name: 'Uppdatera underlaget' }));
  expect((rate as HTMLInputElement).value).toBe('11.5');
  await userEvent.click(screen.getByRole('button', { name: 'Spara månadens antaganden' }));
  expect(await screen.findByText('Månadens antaganden är sparade.')).toBeDefined();
  expect(writes).toEqual([
    {
      month,
      version: 1,
      sekPerUsd: 11.5,
      computeUsd: 7,
      diskGb: 1,
      diskUsdPerGb: 0.25,
      workspace: 'pro',
      workspaceUsd: 25,
    },
  ]);
  expect(screen.queryByLabelText('SEK per USD')).toBeNull();
  expect(
    within(screen.getByRole('region', { name: 'Prisunderlag' })).getByText(/1 USD = 11,5 SEK/),
  ).toBeDefined();
  expect(screen.getByText('Tidigare antaganden för månaden')).toBeDefined();
});

test.each(['', '-1', '0'])(
  'rejects invalid exchange assumption %s without submitting',
  async (value) => {
    let writes = 0;
    vi.stubGlobal('fetch', async (_path: string, init?: RequestInit) => {
      if (init?.method === 'POST') writes++;
      return Response.json(sample);
    });
    render(<Costs onAccessLost={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ändra månadens antaganden' }));
    fireEvent.change(screen.getByLabelText('SEK per USD'), { target: { value } });
    await userEvent.click(screen.getByRole('button', { name: 'Spara månadens antaganden' }));
    expect((await screen.findByRole('alert')).textContent).toContain('positiv valutakurs');
    expect(writes).toBe(0);
  },
);

test('opens cost navigation for the installation operator without household membership', async () => {
  const paths: string[] = [];
  vi.stubGlobal('fetch', async (path: string) => {
    paths.push(path);
    if (path === '/api/bootstrap')
      return Response.json({
        status: 'forbidden',
        operator: true,
        providers: ['google'],
        user: { id: 'operator', name: 'Alex' },
      });
    return Response.json(sample);
  });
  render(
    <MemoryRouter initialEntries={['/costs']}>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByRole('heading', { name: 'Månadskostnad', level: 1 })).toBeDefined();
  expect(await screen.findByRole('region', { name: 'Render – hel månad' })).toBeDefined();
  expect(screen.getByRole('link', { name: 'Månadskostnad' }).getAttribute('href')).toBe('/costs');
  expect(screen.queryByRole('heading', { name: 'Du har inte tillgång till hushållet' })).toBeNull();
  expect(paths.some((path) => path.startsWith('/api/households/'))).toBe(false);
});

test.each([400, 409, 503])(
  'keeps known totals and provides safe assumption recovery after HTTP %s',
  async (status) => {
    let writes = 0;
    vi.stubGlobal('fetch', async (_path: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        writes++;
        return Response.json({ error: 'synthetic_failure' }, { status });
      }
      return Response.json(sample);
    });
    render(<Costs onAccessLost={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ändra månadens antaganden' }));
    await userEvent.click(screen.getByRole('button', { name: 'Spara månadens antaganden' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      status === 400
        ? 'Kontrollera värdena'
        : status === 409
          ? 'ändrats i en annan vy'
          : 'Sparresultatet är okänt',
    );
    expect(screen.getByRole('region', { name: 'Render – hel månad' }).textContent).toContain(
      '72,50 SEK',
    );
    const save = screen.getByRole('button', {
      name: 'Spara månadens antaganden',
    }) as HTMLButtonElement;
    expect(save.closest('fieldset')?.disabled).toBe(status !== 400);
    if (status !== 400) {
      await userEvent.click(save);
      expect(writes).toBe(1);
    }
    await userEvent.click(screen.getByRole('button', { name: 'Uppdatera underlaget' }));
    expect(screen.queryByRole('alert')).toBeNull();
    if (status !== 400)
      expect(await screen.findByText(/Aktuella antaganden är hämtade/)).toBeDefined();
  },
);

test('keeps prior data visibly stale on network failure and replaces it with a more complete read', async () => {
  let reads = 0;
  vi.stubGlobal('fetch', async () => {
    reads++;
    if (reads === 2) throw new TypeError('synthetic offline');
    return Response.json(
      reads === 1
        ? sample
        : {
            ...sample,
            live: {
              ...sample.live,
              seconds: { known: 15, missing: 0 },
              issues: [],
              uncertainAttempts: 0,
              unpricedAttempts: 0,
            },
            total: { ...sample.total, incomplete: false },
          },
    );
  });
  render(<Costs onAccessLost={vi.fn()} />);
  await screen.findByRole('region', { name: 'Live – uppmätt hittills' });
  await userEvent.click(screen.getByRole('button', { name: 'Uppdatera underlaget' }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Tidigare hämtade värden är inaktuella',
  );
  expect(screen.getByRole('region', { name: 'Live – uppmätt hittills' }).textContent).toContain(
    '12 sekunder rapporterade',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Uppdatera underlaget' }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('region', { name: 'Live – uppmätt hittills' }).textContent).toContain(
    '15 sekunder rapporterade',
  );
  expect(screen.getByText(/Uppskattad totalsumma/)).toBeDefined();
});

test.each([401, 403])(
  'clears protected data after HTTP %s and ignores an older successful refresh',
  async (status) => {
    let reads = 0;
    let release!: (response: Response) => void;
    const delayed = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const lost = vi.fn();
    vi.stubGlobal('fetch', async () => {
      reads++;
      return reads === 1
        ? Response.json(sample)
        : reads === 2
          ? delayed
          : Response.json({ error: 'denied' }, { status });
    });
    render(<Costs onAccessLost={lost} />);
    await screen.findByRole('region', { name: 'Render – hel månad' });
    await userEvent.click(screen.getByRole('button', { name: 'Uppdatera underlaget' }));
    await userEvent.click(screen.getByRole('button', { name: 'Uppdatera underlaget' }));
    expect((await screen.findByRole('alert')).textContent).toContain('inte längre tillgång');
    expect(lost).toHaveBeenCalledOnce();
    await act(async () => release(Response.json(sample)));
    expect(screen.queryByRole('region', { name: 'Render – hel månad' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Uppdatera underlaget' })).toBeNull();
    fireEvent.focus(window);
    expect(reads).toBe(3);
  },
);

test('changing the month clears the previous display and ignores its delayed reply', async () => {
  let release!: (response: Response) => void;
  const delayed = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const paths: string[] = [];
  vi.stubGlobal('fetch', async (path: string) => {
    paths.push(path);
    return path.endsWith('2001-02')
      ? Response.json({
          ...sample,
          month: '2001-02',
          coverageIncomplete: true,
          total: { ...sample.total, estimatedSek: 99 },
        })
      : delayed;
  });
  render(<Costs onAccessLost={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Månad (UTC)'), { target: { value: '2001-02' } });
  expect(await screen.findByText(/Månaden har ofullständig mätning/)).toBeDefined();
  expect(screen.getByText(/Delsumma för beräkningsbara delar/).textContent).toContain('99,00 SEK');
  await act(async () => release(Response.json(sample)));
  expect(screen.getByText(/Delsumma för beräkningsbara delar/).textContent).toContain('99,00 SEK');
  expect(paths).toContain('/api/operator/costs?month=2001-02');
});

test('renders unknown-only consumption without a false zero amount and explains all uncertainty kinds', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json({
      ...sample,
      recordingUnavailable: true,
      live: { ...sample.live, estimatedUsd: 0, estimatedSek: 0, attempts: 1, unpricedAttempts: 1 },
      terra: {
        ...sample.terra,
        issues: [
          'inconsistent_usage',
          'unsupported_model',
          'unsupported_tier',
          'assumed_standard',
        ].map((code) => ({ code, count: 1 })),
      },
    }),
  );
  render(<Costs onAccessLost={vi.fn()} />);
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Registreringen av förbrukning har haft ett fel',
  );
  const live = screen.getByRole('region', { name: 'Live – uppmätt hittills' });
  expect(live.textContent).toContain('Belopp saknas');
  expect(live.textContent).not.toContain('0,00 SEK');
  const terra = screen.getByRole('region', { name: 'Terra – uppmätt hittills' });
  expect(terra.textContent).toContain('Mätvärden som inte går ihop: 1');
  expect(terra.textContent).toContain('Modell utan tillämpligt prisunderlag: 1');
  expect(terra.textContent).toContain('Servicenivå utan tillämpligt prisunderlag: 1');
  expect(terra.textContent).toContain('Standardnivå antas');
});

test.each(['setup', 'forbidden', 'ready'])(
  'denies /costs to a nonoperator with %s household status',
  async (status) => {
    const paths: string[] = [];
    vi.stubGlobal('fetch', async (path: string) => {
      paths.push(path);
      return Response.json({
        status,
        operator: false,
        providers: ['google'],
        user: { id: 'other', name: 'Kim' },
        household: { id: 'linden', role: 'administrator', name: 'Linden' },
      });
    });
    render(
      <MemoryRouter initialEntries={['/costs']}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole('heading', { name: /Endast installationens driftansvarige/ }),
    ).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Månadskostnad' })).toBeNull();
    expect(paths).toEqual(['/api/bootstrap']);
  },
);

test('refreshes on visible intervals and return from another tab while preserving unsent settings', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  let reads = 0;
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('fetch', async () => {
    reads++;
    return Response.json({
      ...sample,
      live: { ...sample.live, seconds: { known: reads * 12, missing: 0 } },
    });
  });
  render(<Costs onAccessLost={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Ändra månadens antaganden' }));
  fireEvent.change(screen.getByLabelText('SEK per USD'), { target: { value: '12' } });
  await act(async () => {
    vi.advanceTimersByTime(15000);
  });
  expect(screen.getByRole('region', { name: 'Live – uppmätt hittills' }).textContent).toContain(
    '24 sekunder rapporterade',
  );
  visibility.mockReturnValue('hidden');
  await act(async () => {
    vi.advanceTimersByTime(15000);
  });
  expect(reads).toBe(2);
  visibility.mockReturnValue('visible');
  await act(async () => {
    fireEvent(document, new Event('visibilitychange'));
  });
  expect(screen.getByRole('region', { name: 'Live – uppmätt hittills' }).textContent).toContain(
    '36 sekunder rapporterade',
  );
  expect((screen.getByLabelText('SEK per USD') as HTMLInputElement).value).toBe('12');
  await userEvent.click(screen.getByRole('button', { name: 'Stäng redigering' }));
  expect(screen.queryByLabelText('SEK per USD')).toBeNull();
});

test('recovers a saved assumption after its reply is lost without sending a duplicate write', async () => {
  let writes = 0;
  vi.stubGlobal('fetch', async (_path: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      writes++;
      throw new TypeError('synthetic response lost after commit');
    }
    return Response.json(
      writes === 0
        ? sample
        : { ...sample, assumptions: { ...sample.assumptions, version: 2, sekPerUsd: 12 } },
    );
  });
  render(<Costs onAccessLost={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Ändra månadens antaganden' }));
  fireEvent.change(screen.getByLabelText('SEK per USD'), { target: { value: '12' } });
  await userEvent.click(screen.getByRole('button', { name: 'Spara månadens antaganden' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Sparresultatet är okänt');
  expect(screen.queryByText('Månadens antaganden är sparade.')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Uppdatera underlaget' }));
  expect(await screen.findByText(/Aktuella antaganden är hämtade/)).toBeDefined();
  expect(screen.getByText(/1 USD = 12 SEK/)).toBeDefined();
  expect(writes).toBe(1);
});

test('clears edited assumptions as well as totals when a write discovers lost operator access', async () => {
  const lost = vi.fn();
  vi.stubGlobal('fetch', async (_path: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? Response.json({ error: 'forbidden' }, { status: 403 })
      : Response.json(sample),
  );
  render(<Costs onAccessLost={lost} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Ändra månadens antaganden' }));
  await userEvent.click(screen.getByRole('button', { name: 'Spara månadens antaganden' }));
  expect((await screen.findByRole('alert')).textContent).toContain('inte längre tillgång');
  expect(lost).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText('SEK per USD')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Render – hel månad' })).toBeNull();
});
