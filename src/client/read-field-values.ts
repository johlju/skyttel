import type { Lifecycle } from '../shared/lifecycle.js';

export function lifecycleText(lifecycle?: Lifecycle) {
  if (lifecycle === 'ended') return 'Manuellt upphört';
  return 'Gäller fortfarande';
}
