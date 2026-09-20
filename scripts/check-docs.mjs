import { globSync } from 'node:fs';

import { lint } from 'markdownlint/sync';

const result = lint({
  files: [...globSync('docs/**/*.md').sort(), 'SECURITY.md'],
  config: { default: true, MD060: { style: 'compact' } },
});
for (const [file, errors] of Object.entries(result)) {
  for (const error of errors) {
    console.error(
      `${file}:${error.lineNumber} ${error.ruleNames[0]} ${error.ruleDescription}: ${error.errorDetail ?? ''}`,
    );
    process.exitCode = 1;
  }
}
