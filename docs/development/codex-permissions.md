# Codex command permissions

The repository configures Codex in `.codex/config.toml`. Terminal command
approvals live alongside that file in `.codex/rules/`.

The `github.rules` file allows `gh` with any subcommand and arguments to run
outside the sandbox without a command approval prompt. This includes commands
that modify or delete GitHub resources. The rule does not restrict the target
repository selected by the arguments.

Restart Codex to load the rule. Project rules load only when the repository's
`.codex/` configuration is trusted. More restrictive matching rules take
precedence.

Shell scripts containing heredocs, redirection, variable expansion, or control
flow can still require approval because Codex evaluates the entire shell
invocation instead of matching the `gh` prefix. The multiline issue workflow
in `AGENTS.md` uses a separate temporary file and a direct `gh` invocation
with `--body-file /absolute/path` so that the command matches the rule.

Validate the rule without executing a GitHub command:

```sh
codex execpolicy check --rules .codex/rules/github.rules -- gh issue create
```

See the [official Codex rules documentation](https://learn.chatgpt.com/docs/agent-configuration/rules).
