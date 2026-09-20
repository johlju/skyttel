import { type FinancialFacts, financialFields } from '../shared/financial-facts.js';
import { MapError } from './map-error.js';

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function readFinancialFacts(input: unknown): FinancialFacts | undefined {
  if (input === undefined) return undefined;
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new MapError('invalid_request', 400);
  const facts: FinancialFacts = {};
  for (const [key, entry] of Object.entries(input)) {
    const field = financialFields.find((field) => field.key === key);
    if (!field || !entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new MapError('invalid_request', 400);
    const { knowledge, value, reportedOn } = entry;
    if (
      Object.keys(entry).some((key) => !['knowledge', 'value', 'reportedOn'].includes(key)) ||
      (reportedOn !== undefined && (!field.dated || !isDate(reportedOn)))
    )
      throw new MapError('invalid_request', 400);
    const date = reportedOn === undefined ? {} : { reportedOn };
    if (knowledge === 'unknown' || knowledge === 'none') {
      if (value !== undefined) throw new MapError('invalid_request', 400);
      facts[field.key] = { knowledge, ...date };
    } else if (knowledge === 'known' || knowledge === 'uncertain') {
      if (
        typeof value !== 'string' ||
        !value.trim() ||
        value.length > (field.input === 'textarea' ? 2000 : 200) ||
        (field.input === 'date' && !isDate(value))
      )
        throw new MapError('invalid_request', 400);
      facts[field.key] = { knowledge, value, ...date };
    } else throw new MapError('invalid_request', 400);
  }
  return Object.keys(facts).length ? facts : undefined;
}
