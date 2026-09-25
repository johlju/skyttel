# Copilot Instructions

## Documentation

- For affected documentation under `docs/**/*.md`, identify the intended
  readers and what they need to know or do.
  - Keep `docs/development/` focused on environment setup, running tests, and
  developer workflows. Consolidate guidance in the existing setup and testing
  guides; omit per-feature implementation descriptions and application internals.
  - Keep manual test cases and their preparation under `docs/manual-tests/`,
    operational procedures under `docs/operations/`, and user tasks under `docs/user-guide/`.
- Create or update guidance when it is missing, inaccurate, or insufficient
  for those readers. Leave accurate, sufficient guidance unchanged.
- Match content and technical detail to the audience: developers,
  application users, operators, or other readers. Include information only
  when it helps them complete tasks, make decisions, or avoid mistakes.
- Remove obsolete or audience-irrelevant content. Delete a document when
  none of its content remains useful; update or remove links to it.
