import type { Page } from '@playwright/test';

export async function denyRecoveryStorage(
  page: Page,
  prefix: 'skyttel-erasure:' | 'skyttel-import:',
  method: 'setItem' | 'removeItem',
) {
  await page.evaluate(
    ({ prefix, method }) => {
      const set = Storage.prototype.setItem;
      const remove = Storage.prototype.removeItem;
      Storage.prototype.setItem = function (key, value) {
        if (method === 'setItem' && key.startsWith(prefix))
          throw new DOMException('Controlled recovery storage denial', 'QuotaExceededError');
        return set.call(this, key, value);
      };
      Storage.prototype.removeItem = function (key) {
        if (method === 'removeItem' && key.startsWith(prefix))
          throw new DOMException('Controlled recovery storage denial', 'SecurityError');
        return remove.call(this, key);
      };
      window.addEventListener(
        'restore-recovery-storage',
        () => {
          Storage.prototype.setItem = set;
          Storage.prototype.removeItem = remove;
        },
        { once: true },
      );
    },
    { prefix, method },
  );
}

export async function restoreRecoveryStorage(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('restore-recovery-storage')));
}
