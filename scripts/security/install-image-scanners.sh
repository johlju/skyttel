#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 1 || $(uname -s) != Linux || $(uname -m) != x86_64 ]]; then
  echo "Usage on Linux AMD64: bash scripts/security/install-image-scanners.sh <tool-directory>" >&2
  exit 2
fi

mkdir -p -- "$1"
destination=$(realpath -- "$1")
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
cd "$scratch"
curl --fail --silent --show-error --location --retry 3 \
  https://github.com/anchore/grype/releases/download/v0.119.0/grype_0.119.0_linux_amd64.tar.gz -o grype.tar.gz
curl --fail --silent --show-error --location --retry 3 \
  https://github.com/anchore/syft/releases/download/v1.52.0/syft_1.52.0_linux_amd64.tar.gz -o syft.tar.gz
printf '%s\n' \
  '3fa2dc4b924621ab65404cf08d0b8438d896d80ab949c9d5a4ca283c36004c9b  grype.tar.gz' \
  'caeedb81fb0491615f1ebd1761e4145d41ee86dd2cc7bf80669f9f5ad9d6133d  syft.tar.gz' | sha256sum --check
tar -xzf grype.tar.gz grype
tar -xzf syft.tar.gz syft
install -m 0755 grype syft "$destination"
