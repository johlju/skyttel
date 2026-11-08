import rawCatalog from './catalog.json' with { type: 'json' };
import type { Catalog, Scenario } from './types.js';

const catalog = rawCatalog as Catalog;
export function scenarioHistory(scenario: Scenario) {
  const history = scenario.history ? catalog.histories?.[scenario.history] : catalog.summaryHistory;
  if (!history || history.length < 8) throw new Error('evaluation_history_fixture_missing');
  return history;
}
