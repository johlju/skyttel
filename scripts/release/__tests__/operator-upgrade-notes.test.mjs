import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  meaningfulUnreleasedChange,
  parseOperatorUpgradeNotes,
} from '../operator-upgrade-notes.mjs';

const empty = '# Operator Upgrade Notes\n\n## Unreleased\n';
const block = '<!-- operator-upgrade:source pr-1 start -->\nBack up SQL.\n<!-- operator-upgrade:source pr-1 end -->';
const history = '\n## v1.0.0 - 2026-08-01\n\nExisting history.\n';
const source = `${empty}\n${block}\n${history}`;

describe('committed operator notes', () => {
  it('separates cumulative Unreleased guidance from release history and source markers', () => {
    const document = `${empty}\nNewer guidance.\n\n${block}\n${history}`;
    const parsed = parseOperatorUpgradeNotes(document);
    assert.equal(parsed.content, document);
    assert.match(parsed.unreleased, /Newer guidance/u);
    assert.match(parsed.unreleased, /Back up SQL/u);
    assert.equal(parsed.unreleased.includes('operator-upgrade:source'), false);
    assert.equal(parsed.history, history.trimStart());
  });

  it('rejects missing headings, invalid history and unbalanced source markers', () => {
    for (const document of [
      undefined, '# Notes', `${empty}\n## Unreleased\n`,
      `${empty}\n## Invalid\n`,
      '# Notes\n\n## v1.0.0 - 2026-08-01\n\n## Unreleased\n',
      `${empty}\n<!-- operator-upgrade:source pr-1 start -->`,
      `${empty}\n<!-- operator-upgrade:source pr-1 end -->`,
      `${empty}\n${block}\n${block}`,
      `${empty}\n<!-- operator-upgrade:source pr-1 start -->\n<!-- operator-upgrade:source pr-2 start -->`,
    ]) {
      assert.throws(() => parseOperatorUpgradeNotes(document));
    }
  });

  it('accepts new or corrected guidance but ignores history-only changes', () => {
    assert.equal(meaningfulUnreleasedChange(empty, source), true);
    assert.equal(meaningfulUnreleasedChange(source, source.replace('Back up SQL.', 'Back up SQL and keys.')), true);
    assert.equal(meaningfulUnreleasedChange(source, source.replace('Existing history.', 'Corrected history.')), false);
    assert.equal(meaningfulUnreleasedChange(source, empty), false);
  });

  it('rejects removing an interior paragraph or words while preserving surrounding guidance', () => {
    const before = `${empty}\nBack up the database.\n\nStop the service.\n\nRestart the application.\n`;
    const after = before.replace('\nStop the service.\n', '');
    assert.equal(meaningfulUnreleasedChange(before, after), false);
    assert.equal(meaningfulUnreleasedChange(
      `${empty}\nBack up the database and encryption keys.\n`,
      `${empty}\nBack up the encryption keys.\n`,
    ), false);
  });

  it('rejects equivalent Markdown formatting and source-marker or comment changes', () => {
    for (const [before, after] of [
      ['* Restart the service.', '- Restart the service.'],
      ['- Restart the service.', '1. Restart the service.'],
      ['See https://example.test.', 'See [https://example.test](https://example.test).'],
      ['**Back up SQL.**', 'Back up SQL.'],
      ['Back up SQL.', 'Back up\n SQL.'],
      ['Back up SQL.', '<!-- Added metadata -->\nBack up SQL.'],
      ['Back up SQL.', block],
    ]) {
      assert.equal(meaningfulUnreleasedChange(`${empty}\n${before}\n`, `${empty}\n${after}\n`), false);
    }
  });
});
