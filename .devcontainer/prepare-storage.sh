#!/usr/bin/env bash
set -euo pipefail

# Dev Containers can remap the vscode UID/GID on Linux hosts. Repair only
# container-owned storage; never follow symlinks or change host Codex mounts.
owner="$(id -u):$(id -g)"
storage=(
  /data
  "$HOME/.codex"
  "$HOME/.codex/tmp"
  "$HOME/.config"
  "$HOME/.vscode-server"
  "$HOME/worktrees"
  /workspace/node_modules
)
sudo mkdir -p "${storage[@]}"
for directory in "${storage[@]}"; do
  sudo find -P "$directory" -xdev \
    \( -path "$HOME/.codex/sessions" \
       -o -path "$HOME/.codex/plugins" \
       -o -path "$HOME/.codex/skills" \
       -o -path "$HOME/.codex/rules" \
       -o -path "$HOME/.codex/auth.json" \) -prune \
    -o \( ! -uid "$(id -u)" -o ! -gid "$(id -g)" \) \
    -exec chown -h "$owner" {} +
done
