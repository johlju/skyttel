export const financialFields = [
  { key: 'price', label: 'Pris', input: 'text', dated: false },
  { key: 'currency', label: 'Valuta', input: 'text', dated: false },
  { key: 'paymentInterval', label: 'Betalningsintervall', input: 'text', dated: false },
  { key: 'startDate', label: 'Startdatum', input: 'date', dated: false },
  { key: 'endDate', label: 'Slutdatum', input: 'date', dated: false },
  { key: 'terms', label: 'Avtalsvillkor', input: 'textarea', dated: false },
  { key: 'debt', label: 'Senast uppgiven skuld', input: 'text', dated: true },
  { key: 'creditLimit', label: 'Beviljat kreditutrymme', input: 'text', dated: true },
  { key: 'usedCredit', label: 'Utnyttjad kredit', input: 'text', dated: true },
] as const;

export type FinancialField = (typeof financialFields)[number]['key'];
export type FinancialFact = (
  | { knowledge: 'known' | 'uncertain'; value: string }
  | { knowledge: 'unknown' | 'none'; value?: never }
) & { reportedOn?: string };
export type FinancialFacts = Partial<Record<FinancialField, FinancialFact>>;
