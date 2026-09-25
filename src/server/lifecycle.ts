import type { Lifecycle } from '../shared/lifecycle.js';
import { MapError } from './map-error.js';

export function readLifecycle(value: unknown): Lifecycle | undefined {
  if (value === undefined || value === 'active' || value === 'ended') return value;
  throw new MapError('invalid_request', 400);
}
