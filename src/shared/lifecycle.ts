export type Lifecycle = 'active' | 'ended';

export interface LifecycleValue {
  lifecycle?: Lifecycle;
}

export function hasEnded(value: LifecycleValue) {
  return value.lifecycle === 'ended';
}
