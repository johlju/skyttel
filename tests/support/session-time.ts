import { type APIRequestContext, expect } from '@playwright/test';

/** Arrange an absolute-end test through authorized meaningful actions. The
 * last jump contains no activity, so exact expiry is still tested normally. */
export async function advanceActiveLogin(
  client: APIRequestContext,
  origin: string,
  milliseconds: number,
  advance: (milliseconds: number) => void,
) {
  async function activity() {
    const response = await client.post(`${origin}/api/browser-binding/activity`, {
      headers: { origin },
      data: { kind: 'navigate' },
    });
    expect(response.status(), await response.text()).toBe(200);
  }
  await activity();
  let remaining = milliseconds;
  while (remaining > 29 * 60_000) {
    advance(29 * 60_000);
    remaining -= 29 * 60_000;
    await activity();
  }
  advance(remaining);
}
