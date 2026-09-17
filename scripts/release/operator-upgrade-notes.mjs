export const DEFAULT_OPERATOR_UPGRADE_NOTES_PATH = 'docs/operations/operator-upgrade-notes.md';

function stripOperatorUpgradeSourceMarkers(content) {
  return content.replace(/^\s*<!-- operator-upgrade:source \S+ (?:start|end) -->\s*$/gmu, '');
}

export function parseOperatorUpgradeNotes(content, filePath = DEFAULT_OPERATOR_UPGRADE_NOTES_PATH) {
  if (typeof content !== 'string' || !/^# [^\n]+/u.test(content)) {
    throw new Error(`Operator upgrade notes file ${filePath} is missing or malformed.`);
  }
  const headings = [...content.matchAll(/^##[ \t]+(.+?)[ \t]*$/gmu)];
  if (
    headings[0]?.[1] !== 'Unreleased' ||
    headings.filter((match) => match[1] === 'Unreleased').length !== 1
  ) {
    throw new Error(
      `Operator upgrade notes file ${filePath} must contain exactly one leading "## Unreleased".`,
    );
  }
  if (headings.slice(1).some((match) => !/^v\d+\.\d+\.\d+ - \d{4}-\d{2}-\d{2}$/u.test(match[1]))) {
    throw new Error('Malformed operator notes release history heading.');
  }
  let open;
  const sources = new Set();
  for (const match of content.matchAll(/<!-- operator-upgrade:source (\S+) (start|end) -->/gu)) {
    if (match[2] === 'start') {
      if (open || sources.has(match[1])) {
        throw new Error('Duplicate or nested operator notes source marker.');
      }
      open = match[1];
      sources.add(open);
    } else {
      if (open !== match[1]) throw new Error('Unbalanced operator notes source marker.');
      open = undefined;
    }
  }
  if (open) throw new Error('Unbalanced operator notes source marker.');
  const start = headings[0].index + headings[0][0].length;
  const end = headings[1]?.index ?? content.length;
  const section = content.slice(start, end);
  return {
    content,
    before: content.slice(0, start),
    section,
    history: content.slice(end),
    unreleased: stripOperatorUpgradeSourceMarkers(section).trim(),
  };
}

export function meaningfulUnreleasedChange(baseNotes, headNotes) {
  const normalize = (value) =>
    value
      .replace(/<!--[\s\S]*?-->/gu, '')
      .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gmu, '')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/gu, (_match, label, url) =>
        label === url ? url : `${label} ${url}`,
      )
      .replace(/<([^>]+)>/gu, '$1')
      .replace(/[*_#>`~]/gu, '')
      .replace(/\s+/gu, ' ')
      .trim();
  const before = normalize(parseOperatorUpgradeNotes(baseNotes).unreleased);
  const after = normalize(parseOperatorUpgradeNotes(headNotes).unreleased);
  if (!after || after === before) return false;
  // If every remaining word appears in the same order, only wording was removed.
  // This also catches deletions from the middle of paragraphs or between entries.
  const beforeWords = before.split(' ');
  let position = 0;
  for (const word of after.split(' ')) {
    const index = beforeWords.indexOf(word, position);
    if (index === -1) return true;
    position = index + 1;
  }
  return false;
}
