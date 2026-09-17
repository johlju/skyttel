#!/usr/bin/env bash
set -euo pipefail

node_version="$(cat "${1:?Pass the .node-version file}")"
if [[ ! "$node_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo '.node-version must contain an exact Node.js version.' >&2
  exit 1
fi

case "$(dpkg --print-architecture)" in
  amd64) node_arch=x64 ;;
  arm64) node_arch=arm64 ;;
  *) echo 'Unsupported Node.js container architecture.' >&2; exit 1 ;;
esac

node_directory="$(mktemp -d)"
trap 'rm -rf "$node_directory"' EXIT
cd "$node_directory"
node_archive="node-v${node_version}-linux-${node_arch}.tar.xz"
node_release="https://nodejs.org/dist/v${node_version}"
curl --fail --silent --show-error --location --retry 3 \
  --output "$node_archive" "${node_release}/${node_archive}"
curl --fail --silent --show-error --location --retry 3 \
  --output SHASUMS256.txt "${node_release}/SHASUMS256.txt"
awk -v archive="$node_archive" '$2 == archive { print }' SHASUMS256.txt |
  sha256sum --check --strict -
tar --extract --xz --file "$node_archive" --directory /usr/local \
  --strip-components=1 --no-same-owner
test "$(node --version)" = "v${node_version}"
node --version
