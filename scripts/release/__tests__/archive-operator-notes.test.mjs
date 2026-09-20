import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { archiveOperatorNotes } from '../archive-operator-notes.mjs';
import { parseOperatorUpgradeNotes } from '../operator-upgrade-notes.mjs';

const prefix = '# Operator Upgrade Notes\n\n## Unreleased\n\n';
const delivered = '### Database backup\n\nBack up SQL and keys.\n\n';
const revised = '### Updated configuration\n\nKeep the new setting.\n\n';
const historical = '## v0.9.0 - 2026-08-01\n\nPrevious guidance.\n';

describe('archiving delivered operator guidance', () => {
  it('keeps source-marker groups intact when any of their delivered headings changes', () => {
    const source =
      '<!-- operator-upgrade:source pr-66 start -->\n### Configuration\n\nKeep the setting.\n<!-- operator-upgrade:source pr-66 end -->';
    const changed = source.replace('Keep the setting.', 'Keep the corrected setting.');
    const moved =
      '<!-- operator-upgrade:source pr-70 start -->\n### Database\n\nBack up SQL.\n<!-- operator-upgrade:source pr-70 end -->';
    const archived = archiveOperatorNotes({
      current: `${prefix}${changed}\n\n${moved}\n\n${historical}`,
      snapshot: `${prefix}${source}\n\n${moved}\n\n${historical}`,
      release: { channel: 'stable', tag: 'v1.0.0' },
      date: '2026-09-20',
    });
    const parsed = parseOperatorUpgradeNotes(archived);
    assert.equal(parsed.section.trim(), changed);
    assert.ok(parsed.history.includes(moved));
    assert.equal(parsed.history.includes('pr-66'), false);
  });

  it('never drains preview guidance and preserves existing release history on repeated requests', () => {
    const current = `${prefix}${delivered}${historical}`;
    const input = {
      current,
      snapshot: current,
      release: { channel: 'stable', tag: 'v1.0.0' },
      date: '2026-09-20',
    };
    assert.throws(
      () =>
        archiveOperatorNotes({
          ...input,
          release: { channel: 'preview', tag: 'v1.0.0-preview.1' },
        }),
      /stable/u,
    );
    assert.throws(() => archiveOperatorNotes({ ...input, date: '2026-02-31' }), /date/u);
    const archived = archiveOperatorNotes(input);
    assert.equal(archiveOperatorNotes({ ...input, current: archived }), archived);
    assert.throws(
      () =>
        archiveOperatorNotes({
          ...input,
          current: archived.replace('## Unreleased\n\n', `## Unreleased\n\n${delivered}`),
        }),
      /already archived/u,
    );
  });

  it('moves only exact delivered sections and leaves newer or edited headings in Unreleased', () => {
    const snapshot = `${prefix}${delivered}### Configuration\n\nKeep the setting.\n\n${historical}`;
    const current = `${prefix}${delivered}${revised}### Newly added\n\nCheck storage.\n\n${historical}`;
    const archived = archiveOperatorNotes({
      current,
      snapshot,
      release: { channel: 'stable', tag: 'v1.0.0' },
      date: '2026-09-20',
    });
    assert.equal(
      archived,
      `${prefix}${revised}### Newly added\n\nCheck storage.\n\n## v1.0.0 - 2026-09-20\n\n${delivered}${historical}`,
    );
  });
});
