#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  npm run container:vulnerability:check -- --local <image> <new-evidence-directory>
  npm run container:vulnerability:check -- --upstream <repository@platform-digest> <new-evidence-directory>

Place the repository-pinned Syft and Grype on PATH. Both modes require Docker.
Upstream scans use a Linux AMD64 platform manifest and an empty exception set.
EOF
}

if [[ $# = 1 && $1 = --help ]]; then
  usage
  exit 0
fi
if [[ $# != 3 || ( $1 != --local && $1 != --upstream ) || -z $2 || $2 = -* ]]; then
  usage >&2
  exit 2
fi

mode=$1
image=$2
reports=$3
exceptions=.github/security-exceptions.json
if [[ $mode = --upstream && ! $image =~ ^[^@[:space:]]+@sha256:[a-f0-9]{64}$ ]]; then
  echo 'Provide an upstream reference pinned to its platform manifest digest.' >&2
  exit 2
fi

for tool in docker grype jq syft; do
  if ! command -v "$tool" >/dev/null; then
    echo "Missing required tool: $tool" >&2
    exit 2
  fi
done

umask 077
mkdir -- "$reports"
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT

printf '%s\n' "$image" > "$reports/image-reference.txt"

if [[ $mode = --upstream ]]; then
  manifest_digest=${image##*@}
  docker buildx imagetools inspect --raw "$image" > "$reports/manifest.json"
  printf '%s  %s\n' "${manifest_digest#sha256:}" "$reports/manifest.json" | sha256sum --check
  image_id=$(jq -er '.config.digest | strings | select(test("^sha256:[a-f0-9]{64}$"))' \
    "$reports/manifest.json") || {
    echo 'Expected a platform manifest with an image configuration digest.' >&2
    exit 2
  }
  source="registry:$image"
  exceptions="$scratch/upstream-exceptions.json"
  printf '%s\n' '{"version":1,"exceptions":[]}' > "$exceptions"
else
  archive="$scratch/image.tar"
  docker_id=$(docker image inspect --format '{{.Id}}' "$image")
  if [[ ! $docker_id =~ ^sha256:[a-f0-9]{64}$ ]]; then
    echo 'Could not resolve an exact Docker image ID.' >&2
    exit 2
  fi
  docker image save --output "$archive" "$docker_id"
  config=$(tar -xOf "$archive" manifest.json | jq -er \
    'select(length == 1) | .[0].Config | strings | select(length > 0)')
  image_id=$(tar -xOf "$archive" -- "$config" | sha256sum | awk '{print "sha256:" $1}')
  source="docker-archive:$archive"
fi
printf '%s\n' "$image_id" > "$reports/image-id.txt"

syft "$source" --quiet -o spdx-json > "$reports/sbom.spdx.json"
GRYPE_DB_REQUIRE_UPDATE_CHECK=true grype "$source" --config .github/grype.yaml \
  --only-fixed=false --quiet -o json > "$reports/grype.json"

if [[ $mode = --upstream ]] &&
  ! jq -e --arg digest "$manifest_digest" \
    '.source.target | .manifestDigest == $digest and .os == "linux" and .architecture == "amd64"' \
    "$reports/grype.json" >/dev/null; then
  echo 'Grype manifest does not match the requested upstream platform digest.' >&2
  exit 2
fi

node scripts/security/check-results.mjs grype "$reports" "$exceptions" 2>&1 \
  | tee "$reports/policy.log"
