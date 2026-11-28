# Agent Instructions

For terminology, read [./GLOSSARY.md](./GLOSSARY.md).

Follow the rules in @.github/copilot-instructions.md and the instructions in `.github/instructions/*.md`

Run builds and tests through the repository's npm scripts to use the
shared process lock.

- Never use `git stash` to see if you caused the error when linting or testing, help fix the error regardless.
- Never use `git checkout`, `git revert` or other Git commands to undo your changes unless you are confident that you won't lose uncommitted work. If you need to undo changes, use `git diff` to compare with the last committed version then use edit tools to implement the necessary fixes.

## Billable provider tests

- Run the real-model and real-voice suites only when relevant to the
  requested change and the user explicitly authorizes billable API calls.
- Treat available credentials and opt-in flags as configuration, not user
  authorization.

## Container image vulnerability gate

For local builds and upstream images, use `npm run container:vulnerability:check`.
For hosted evidence, use the `container` job in `security.yml` or the
`candidate` job in `release.yml`. Both run the shared Skyttel Grype policy
with Syft inventory. See [Security checks](docs/operations/security-checks.md#container-image-vulnerability-gate)
for commands, evidence, and exception scope.

## Spelling

- If cSpell reports a misspelling in a Markdown file, add the word to the
  project dictionary if
  - the word is a correctly spelled technical term
  - the word or term is linguistically correct for the language the text is written in
  - the word is a proper noun (e.g. product name, company name, person's name)
  - the word is a common abbreviation or acronym that is widely recognized in the
    context of the project
- If the word is a misspelling, correct the spelling in the text.

### Issue tracker

Issues (tickets) are tracked as GitHub issues in repository `viscalyx/skyttel`.

- For multiline GitHub Markdown, write the exact text to a temporary file
  with a file-editing tool, then run `gh ... --body-file /absolute/path`
  as a separate command with literal arguments. Verify real line breaks
  with `gh ... view --json body --jq .body` before finishing.
