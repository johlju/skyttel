import { lint } from 'markdownlint/sync';

const result = lint({
  files: [
    'docs/users/access.md',
    'docs/operations/first-time-use.md',
    'docs/operations/installation.md',
    'docs/operations/operator-upgrade-notes.md',
    'docs/development/testing.md',
    'docs/development/devcontainer.md',
    'docs/development/security-checks.md',
    'SECURITY.md',
  ],
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
