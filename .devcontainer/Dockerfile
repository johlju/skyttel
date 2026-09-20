# Cross-platform devcontainer base image
# Supports both AMD64 (Intel/AMD) and ARM64 (Apple Silicon)
# Includes: git, curl, wget, sudo, zsh, and the vscode user
FROM mcr.microsoft.com/devcontainers/base:2.0.5-ubuntu-24.04 AS node-ready

# Install system dependencies needed for npm native modules and SQLite.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        bubblewrap \
        jq \
        libnss3-tools \
        mkcert \
        python-is-python3 \
        python3 \
        python3-pip \
        python3-venv \
        python3-yaml \
        ripgrep \
        sqlite3 \
        xz-utils && \
    rm -rf /var/lib/apt/lists/*

ENV PATH=/home/vscode/.local/bin:${PATH}

# Install the repository's Node and npm versions before container creation.
COPY .node-version package.json /usr/local/share/skyttel/
COPY .devcontainer/install-node.sh /usr/local/share/skyttel/install-node.sh
COPY scripts/install-repository-npm.mjs /usr/local/share/skyttel/scripts/install-repository-npm.mjs
RUN bash /usr/local/share/skyttel/install-node.sh /usr/local/share/skyttel/.node-version && \
    node /usr/local/share/skyttel/scripts/install-repository-npm.mjs && \
    rm -rf /root/.npm

FROM node-ready AS codex-ready

# Use the same verified standalone installer as Kravhantering.
COPY .devcontainer/install-codex.sh /usr/local/share/skyttel/install-codex.sh
RUN install -d -o vscode -g vscode -m 0755 /home/vscode/.codex && \
    CODEX_HOME=/home/vscode/.codex \
    CODEX_INSTALL_DIR=/usr/local/bin \
    CODEX_NON_INTERACTIVE=1 \
    bash /usr/local/share/skyttel/install-codex.sh && \
    chown -R vscode:vscode /home/vscode/.codex && \
    codex --version

FROM codex-ready AS development

# SQLite data and developer state are mounted separately from the checkout.
RUN mkdir -p /data /workspace/node_modules /home/vscode/.config \
        /home/vscode/.vscode-server /home/vscode/worktrees && \
    chown -R vscode:vscode /data /workspace /home/vscode

# Set the working directory
WORKDIR /workspace

# Configure git for the workspace (security requirement)
RUN git config --system --add safe.directory /workspace

# Expose the ports that Skyttel and Playwright use
EXPOSE 3300 3301 5173 9324

# Run the long-lived container process as the same non-root user VS Code uses.
USER vscode

# Keep container running
CMD ["sleep", "infinity"]
