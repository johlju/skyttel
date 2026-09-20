import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_OPERATOR_UPGRADE_NOTES_PATH,
  parseOperatorUpgradeNotes,
} from './operator-upgrade-notes.mjs';

function sections(content) {
  const result = [];
  let pending = [];
  let markerOpen = false;
  const flush = () => {
    const block = pending.join('\n').trim();
    if (block) result.push(block);
    pending = [];
  };
  for (const line of content.split('\n')) {
    const start = /^\s*<!-- operator-upgrade:source \S+ start -->\s*$/u.test(line);
    const end = /^\s*<!-- operator-upgrade:source \S+ end -->\s*$/u.test(line);
    if (!markerOpen && (start || /^### /u.test(line))) flush();
    pending.push(line);
    if (start) markerOpen = true;
    if (end) {
      markerOpen = false;
      flush();
    }
  }
  flush();
  return result;
}

export function archiveOperatorNotes({ current, snapshot, release, date }) {
  if (release.channel !== 'stable' || !/^v\d+\.\d+\.\d+$/u.test(release.tag)) {
    throw new Error('Only a stable release can archive operator guidance.');
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  ) {
    throw new Error('A valid archive date is required.');
  }
  const present = parseOperatorUpgradeNotes(current);
  const delivered = parseOperatorUpgradeNotes(snapshot);
  const sourceBlocks = sections(delivered.section);
  const remaining = [];
  const archived = [];
  for (const block of sections(present.section)) {
    (sourceBlocks.includes(block) ? archived : remaining).push(block);
  }
  if (!archived.length) return current;
  if (present.history.includes(`## ${release.tag} - `)) {
    throw new Error('Operator guidance is already archived for this release.');
  }
  const updated = `${present.before}\n\n${remaining.length ? `${remaining.join('\n\n')}\n\n` : ''}## ${release.tag} - ${date}\n\n${archived.join('\n\n')}\n\n${present.history}`;
  parseOperatorUpgradeNotes(updated);
  return updated;
}

export function main(args = process.argv.slice(2), options = {}) {
  const fsImpl = options.fsImpl ?? fs;
  const consoleObj = options.consoleObj ?? console;
  try {
    const [directory, date, file = DEFAULT_OPERATOR_UPGRADE_NOTES_PATH, ...extra] = args;
    if (!directory || !date || extra.length) {
      throw new Error(
        'Usage: node scripts/release/archive-operator-notes.mjs <evidence-directory> <YYYY-MM-DD> [notes-path]',
      );
    }
    const current = fsImpl.readFileSync(file, 'utf8');
    const updated = archiveOperatorNotes({
      current,
      snapshot: fsImpl.readFileSync(
        path.join(directory, 'operator-upgrade-notes.source.md'),
        'utf8',
      ),
      release: JSON.parse(fsImpl.readFileSync(path.join(directory, 'release.json'), 'utf8')),
      date,
    });
    if (updated !== current) fsImpl.writeFileSync(file, updated);
    consoleObj.log('Review the local operator-note diff in a separate pull request.');
    return 0;
  } catch (error) {
    consoleObj.error(`Operator-note archive error: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
