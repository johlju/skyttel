# Codex defaults and routine skill routing

This evaluation helps repository maintainers choose how to run routine AI
skills. Keep Astra/high for the main thread, Sol/high for default subagents,
and direct execution for `sync-ai-skills` and `sync-ai-instructions`. No
custom agent or model-specific skill route is justified by this small trial.

## Configuration and runtime evidence

The shared `.codex/config.toml` contains:

```toml
model = "gpt-6-astra"
model_reasoning_effort = "high"

[agents]
default_subagent_model = "gpt-6.1-sol"
default_subagent_reasoning_effort = "high"
```

The [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
defines these settings. The
[subagent reference](https://learn.chatgpt.com/docs/agent-configuration/subagents)
describes explicit spawn values taking precedence over defaults and custom
agent files applying their own configuration. Verify actual runtime
selection after changing either kind of override.

Runtime evidence on 2026-10-18 comes from Codex CLI/app-server version
`0.163.0`, using the OpenAI provider. The session rollout's `turn_context`
records identify the model and `effort`; agent self-descriptions are not
evidence. The accompanying
[evidence file](codex-agent-routing-evidence.json) preserves selected runtime
fields and measurements without conversation content or credentials.

| Invocation | Model | Effort | Result |
| --- | --- | --- | --- |
| New main thread for this evaluation | `gpt-6-astra` | `high` | Confirmed |
| Default subagent, no history fork | `gpt-6.1-sol` | `high` | Confirmed |
| Default subagent, full history fork | `gpt-6.1-sol` | `high` | Confirmed |
| Explicit benchmark subagent | `gpt-6.1-sol` | `high` | Confirmed |
| Explicit benchmark subagent | `gpt-6.1-sol` | `low` | Confirmed |

The fork's inherited history also contains the parent's Astra context.
Use the context for the child's own turn, not the first context record.
The spawn tool describes parent inheritance, but these runtime records
confirm Sol/high for both default spawn modes in this client.

The repository has no custom-agent definitions or explicit model/effort
spawn instructions in `.agents`, `.github`, or `.codex` beyond these
defaults. The devcontainer's managed configuration does not set models.
The inspected user configuration trusts `/workspace` and also selects
Astra/high; it has no subagent model default or custom-agent table. Thus the
main-thread result alone cannot distinguish the agreeing user and project
model settings. Host-managed settings and future client behavior still
require runtime checks.

An additional standalone `codex exec --ephemeral --strict-config --json`
probe cannot initialize the in-process app-server: it exits 1 with
`Read-only file system (os error 30)`. Temporary `sqlite_home` and `log_dir`
overrides do not resolve startup. Creating another main thread through the
app tool requires approval, which this environment's `never` policy
disallows. Neither probe establishes an additional CLI runtime result;
the main-thread confirmation above uses this evaluation's fresh app thread.

`gpt-5.6-terra` advertises `high` reasoning in the installed model cache,
but the session's spawn tool does not offer that model. The standalone CLI
startup failure prevents an alternate invocation in this environment.
Terra/high is therefore **skipped**, with no claim of successful invocation
or comparative performance. A catalog entry or API model page is not proof
of availability in this Codex client.

## Scope and method

Both sync skills qualify for evaluation because their bundled scripts
perform bounded filesystem transformations and verification. Other skills
such as triage, code review, dependency updates, and operator guidance need
interpretation, external evidence, or broader validation. Their descriptions
do not establish that this benchmark applies to them; no routing change
extends to those skills.

The sample contains one success case and one controlled failure case for
each skill on each available route: main-thread direct execution, Sol/high,
and Sol/low. Each route uses separate real Git clones of source commit
`4675aa223602ff0408881374ad36b9163834c270`, with sparse paths for
`.agents/skills`, `.github/instructions`, and `.codex`. Each clone receives
the same updated project configuration. Unrelated working-tree edits are
excluded. Each script runs from its clone's actual repository root without
an alternate-root argument:

```sh
bash .agents/skills/sync-ai-skills/scripts/sync_ai_skills.sh
bash .agents/skills/sync-ai-instructions/scripts/sync_ai_instructions.sh
```

The two delegated prompts are identical except for their isolated route
directory. They require reading the skills, running both scripts, checking
their verification output, independently hashing copied skills, preserving
extra files, and reporting both deliberate failures without repairing them.
Both use `fork_turns="none"`; explicit model and effort select each candidate.
The main thread reads the same skills and directly runs the same commands
and checks. It also performs configuration research, so its total turn time
and token usage cannot serve as isolated direct-execution measurements.

Success fixtures contain stale copies of `sync-ai-skills/SKILL.md` and
`markdown.instructions.md`, plus three destination-only files: one inside
a copied skill, one inside an extra skill, and one extra rule. Failure
fixtures contain regular files at both destination directory paths. These
force `mkdir` to fail without changing either source script.

All three routes produce 49 copied skills, matching SHA-256 hashes for
127 source files, and seven converted rules with the required verification
messages. Stale files are overwritten, and all three extra files survive
unchanged. Parent review independently checks the copied hashes and
identical converted rule bytes across routes. Both controlled script
failures exit 1, report `File exists`, and preserve the blocker files.
Neither delegated report claims a failed sync succeeds.

## Measurements and limits

Times are seconds. Script/verification time includes both success and
failure cases. Agent wall time uses runtime task start/completion events.
Dispatch-to-review time ends when the parent finishes checking outputs,
including waiting while the parent performs other evaluation work.

| Route | Script/verification | Agent wall | Dispatch to parent review |
| --- | --- | --- | --- |
| Main-thread direct | 0.409 | Not isolated | Not isolated |
| Sol/high | 0.712 | 79.170 | 117.844 |
| Sol/low | 0.469 | 34.994 | 111.932 |

The parent's final filesystem verification across all routes takes
0.025 seconds, excluding model review time. The direct number measures
execution and verification only, not a full model response. Comparing it
with agent wall time does not establish an end-to-end speedup. The two
delegated trials overlap, and their review times include scheduling delay.
They are exploratory observations, not repeated or randomized benchmarks.

Runtime token counters provide the following totals for each delegated
task, including repeated context and cached input:

| Route | Input | Cached input | Output | Reasoning output |
| --- | --- | --- | --- | --- |
| Sol/high | 249208 | 195968 | 3676 | 460 |
| Sol/low | 135716 | 112256 | 1447 | 56 |

These are runtime counter fields, not invoice amounts. Parent preparation
and review tokens are not attributable separately, and an isolated direct
token total is unavailable. No monetary savings are measured. Sol/low uses
fewer tokens and completes sooner than Sol/high in this single sample, but
that does not demonstrate lower total cost than direct execution or
reliability beyond the tested cases.

## Execution decision and escalation

Keep both sync skills' existing direct execution and verification workflow.
Their scripts finish in under a second in this sample; adding a model
handoff has no demonstrated overall benefit. Keep Sol/high as the general
subagent default, without a new custom agent. Sol/low remains a candidate
for a larger repeated evaluation if delegated work is independently useful.

For either sync skill, inspect and resolve a script or verification failure
in the main thread before rerunning. Never report completion until the
script and its required verification succeed. Preserve extra destination
files and the instructions skill's real-root requirement. Ambiguous input,
changed scripts, permission problems, unavailable models, or work beyond
these bounded sync operations belongs with the main thread or an explicitly
requested default subagent. Do not silently substitute a different model.

Before introducing model-specific routing, repeat matched success and
failure trials with independent direct-main sessions, full parent review
time, and attributable usage. Confirm Terra invocation in the actual
client if evaluating it. Retest defaults and fork behavior after client or
configuration changes, using the new turn's runtime metadata.
