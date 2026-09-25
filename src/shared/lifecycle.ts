import type { FinancialFact, FinancialFacts } from './financial-facts.js';

export type Lifecycle = 'active' | 'ended';

export interface LifecycleValue {
  lifecycle?: Lifecycle;
  financialFacts?: FinancialFacts;
  endDate?: FinancialFact;
}

export function hasEnded(value: LifecycleValue, today = new Date().toISOString().slice(0, 10)) {
  if (value.lifecycle) return value.lifecycle === 'ended';
  const endDate = value.endDate ?? value.financialFacts?.endDate;
  return endDate?.knowledge === 'known' && endDate.value < today;
}
