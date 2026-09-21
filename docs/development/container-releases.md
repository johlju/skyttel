# Publish and verify container releases

This guide is for maintainers who publish, review, or recover a Skyttel
container release. The release workflow publishes to GHCR and GitHub Releases.
After successful publication from `main`, it deploys the exact digest to
Render. Follow the [Render runbook](../operations/render.md) for setup,
deployment evidence and failure recovery. Stable tags publish without
changing production.

## Triggers and version identity

A push to `main` in `viscalyx/skyttel` starts the release chain, including
application tests and security checks. A pushed stable tag `vX.Y.Z` starts a
separate stable chain. Its commit must be part of `origin/main`; the tag and
release plan must identify the same commit. Preview tags created by the
workflow do not trigger another run. An older stable tag is not a request to
replace a newer running main version.

GitVersion uses full Git history and tags, the exact version in
`.config/dotnet-tools.json`, and `GitVersion.yml`. Main uses
ContinuousDelivery with the `preview` label and a patch default. The rules
follow the approved Kravhantering reference:

- `+semver: breaking`, `+semver: major`, or `BREAKING CHANGE:` requests major.
- `+semver: feature`, `+semver: minor`, or a `feat:` prefix requests minor.
- `+semver: fix`, `+semver: patch`, or `fix:` and `perf:` prefixes request patch.
- `+semver: none` and `+semver: skip` suppress the message-based increment.
- The conventional prefixes accept a scope and optional `!`. A `!` alone
  does not request major; use the explicit major signals above.
- `codex/` branches use a patch default. Feature branches use minor and fix
  branches use patch. PR labels never choose the version increment.

The plan preserves the full semantic version and raw GitVersion output,
including informational metadata. Readable Git and image tags omit metadata
after `+`. Preview images also receive `sha-<short-commit>` and
`sha-<full-commit>` aliases. Stable images receive their semantic version tag.
No floating `latest` image tag is published.

`release.json` binds the version, full source commit, source ref, image
manifest digest, image configuration ID, and workflow origin. The manifest
digest identifies the image to use. Separate preview and stable chains may
build different images from the same commit; each chain preserves its own
verified digest.

## Checks and publication

The release first requires the reusable
[application and security checks](security-checks.md). It then builds one
Linux AMD64 OCI archive, checks every blob digest, and verifies its source
and version labels. Container behavior tests, Syft SPDX inventory, Grype
policy, and the ZAP baseline run against that candidate. Publication copies
the same archive with digest preservation; it does not rebuild the image.

Only the publication job receives package write, release write, attestation,
and signing permissions. It verifies the provenance and SBOM signatures,
repository, signer workflow, source commit, source ref, and subject digest
before publishing. The signed SBOM must equal the attached inventory.
An unsuccessful or missing prerequisite prevents an approved release.

GitHub Release assets include the release identity, raw version decision,
image manifest, SPDX inventory, scan reports, signed provenance and SBOM
bundles, and captured operator guidance. Publication starts with a draft;
the release becomes public only after its required assets are complete.

All release runs share one publisher lock. Existing registry tags, Git tags,
release text, and assets must agree with the candidate. Conflicting content
stops publication. The workflow never deliberately moves a version to new
image content or replaces an existing evidence file.

This protection depends on controlling other writers. Restrict package write
access and repository write access to trusted maintainers and this workflow.
Do not let another workflow or token retag published versions or remove
their evidence. Review inherited package permissions and Actions access in
the [GitHub package access settings](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility).

## Review a published release

Use an authenticated GitHub CLI, Node.js, and `jq`. Choose a release tag and
download its assets into a new directory:

```sh
release_tag=vX.Y.Z
release_dir=$(mktemp -d)
gh release download "$release_tag" --repo viscalyx/skyttel \
  --dir "$release_dir"
cat "$release_dir/release.json"
node scripts/release/candidate.mjs verify "$release_dir"
```

Confirm the source commit against the reviewed repository history and the
release tag. Read the changelog and `operator-upgrade-notes.md` before use.
The helper verifies the manifest, both signatures, their expected identities,
and the signed inventory. To independently require a particular approved
source, set the expected commit and ref yourself:

```sh
release_commit=REPLACE_WITH_APPROVED_FULL_COMMIT
release_ref=refs/heads/main
gh attestation verify "$release_dir/manifest.json" \
  --bundle "$release_dir/provenance.sigstore.json" \
  --repo viscalyx/skyttel \
  --signer-workflow viscalyx/skyttel/.github/workflows/release.yml \
  --source-digest "$release_commit" --source-ref "$release_ref" \
  --deny-self-hosted-runners
```

For a stable release, use its `refs/tags/vX.Y.Z` source ref. To check the
inventory bundle directly, use `sbom.sigstore.json` and add
`--predicate-type https://spdx.dev/Document/v2.3` for the SPDX 2.3 inventory.
See the
[GitHub CLI verification reference](https://cli.github.com/manual/gh_attestation_verify)
for the identity checks and supported artifact forms.

Verify the actual registry image as well. Authenticate the container client
to GHCR if its visibility requires it, then verify the digest reference:

```sh
release_image=$(jq -r .image "$release_dir/release.json")
release_digest=$(jq -r .digest "$release_dir/release.json")
gh attestation verify "oci://${release_image}@${release_digest}" \
  --bundle "$release_dir/provenance.sigstore.json" \
  --repo viscalyx/skyttel \
  --signer-workflow viscalyx/skyttel/.github/workflows/release.yml \
  --source-digest "$release_commit" --source-ref "$release_ref" \
  --deny-self-hosted-runners
```

Use that exact image digest in a later rollout. Retain the matching database
backup and follow the [installation guidance](../operations/installation.md)
for compatibility and recovery. Successful publication does not establish
that an installation has deployed or passed its real-provider checks.

## Changelog and operator guidance

GitHub generates the changelog using `.github/release.yml`. Categories cover
security, features, fixes, data, MCP/AI, container operations, CI,
dependencies, documentation, and remaining changes. Only
`ignore-for-release` excludes a PR.

Preview compares with the nearest earlier published preview reachable from
the release commit; stable compares with a stable predecessor. The first
release in a channel explicitly reports that no predecessor exists. A
generation failure is also shown explicitly. Neither case silently selects
the other channel. Review source changes directly when generation is
unavailable.

Operator guidance comes from the release's exact source revision. Both the
original document and its applicable `Unreleased` body are retained. Preview
publication leaves upcoming guidance intact. Stable publication also leaves
the source document untouched. Archive delivered sections through a separate
reviewed change after stable publication; preserve newer or edited guidance
under `Unreleased`.

After downloading and verifying stable release evidence, prepare that local
documentation change with the actual release date:

```sh
node scripts/release/archive-operator-notes.mjs "$release_dir" YYYY-MM-DD
git diff -- docs/operations/operator-upgrade-notes.md
```

The helper accepts stable releases only. It moves unchanged delivered
`###` sections from current `Unreleased` guidance into the dated version
section. New sections and edited sections, including changed headings, stay
under `Unreleased`. Sections inside one source-marker group move together
only when that entire group is unchanged. Existing history and source
markers remain. Review the diff and submit it through a separate PR; the
helper does not publish or commit the change.

## Retry and retention

Use the existing run's retry controls after resolving a transient failure.
Do not delete its artifacts or create replacement tags to force a retry.
The original version plan, verified candidate archive, and signed evidence
are restored when present. Existing files must match before missing files
are added. A retained candidate is reused without rebuilding it. A failure
before candidate verification completes does not create a verified artifact.

The release artifacts request 90 days of Actions retention, subject to
repository policy. This is recovery storage for incomplete runs. An expired
verified artifact stops the retry; do not manufacture another image under
that version. Publication also rechecks the retained scan evidence against
the current policy clock. An expired exception or vulnerability database
older than five days blocks publication. Preserve that evidence and use a
new reviewed source revision and version for a new release chain. GitHub
also limits when a workflow can be rerun; see its
[workflow retry guidance](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs).

Completed release evidence remains in GitHub Release assets and images
remain in GHCR. The workflow does not clean them up. Retain images used for
production or planned recovery together with their release evidence beyond
temporary Actions retention. Do not apply general artifact or package
cleanup to this retained set.

When a retry stops, check its failed step and retained evidence:

- A changed version, commit, digest, source, tag, or file is a conflict.
  Investigate the competing writer or mismatched artifact; do not overwrite
  the existing identity.
- Authentication, registry inspection, signature verification, missing
  evidence, and scanner errors block publication. Restore the required
  access or repair the cause through a reviewed change.
- A draft release or partially uploaded image can remain after an external
  service failure. It is not an approved release. Retry the original chain
  to complete only compatible missing steps.
- Changelog generation failure is visible in release text and does not
  bypass image or signature checks.

Keep tokens, provider credentials, and household data out of logs and release
assets. Use synthetic data for investigation and acceptance evidence.

## External acceptance

Local helper tests and workflow checks do not establish live publication.
The [preview release run](https://github.com/viscalyx/skyttel/actions/runs/35587073912)
and [published preview](https://github.com/viscalyx/skyttel/releases/tag/v0.0.1-preview.24)
provide initial publication evidence. They do not establish stable-channel,
partial-retry, failed-check, or conflict acceptance.
Before treating the chain as production verified, retain links and evidence
for these outcomes:

1. A main push completes checks and publishes a preview whose manifest
   digest, source, signatures, inventory, and guidance verify publicly.
2. A stable tag for an approved main commit publishes a stable release with
   its own valid digest and a comparison only to the stable channel.
3. A required check failure produces no approved release. Preview tag
   creation produces no duplicate release run.
4. A retry after partial publication preserves the original version, image,
   signed bundles, text, and existing assets while completing missing work.
5. A conflicting version, source, registry digest, or evidence file stops
   publication. Use the read-only conflict probes below. Any rehearsal that
   changes remote objects requires an isolated acceptance repository; never
   damage retained releases to create a failure.

Record the run URLs, release URLs, digest references, verification results,
and any unresolved limitations. These results do not verify Render rollout
or daily scanning of running and recovery images; those are separate work.

### Automated live checks

Use the **Container release acceptance** workflow on `main`. It reads
GitHub and GHCR with the workflow token and saves a `release-acceptance`
artifact, including `report.json`, for 90 days. A failed check also produces
a report. Keep the run URL and copy evidence needed for long-term acceptance
before the artifact expires.

The workflow verifies existing results. It does not create stable tags,
retry release runs, inject live failures, or change release assets. Each
successful report covers only its selected scenario. Keep issue #38 open
until the required scenarios have live evidence.

For either release channel, select `release` and supply the published version
or tag. Both `0.0.1-preview.25` and `v0.0.1-preview.25` are accepted. Surrounding
whitespace is removed, and a missing `v` prefix is added automatically:

```sh
gh workflow run release-acceptance.yml --repo viscalyx/skyttel --ref main \
  -f scenario=release -f tag=v0.0.1-preview.24
```

Repeat with an approved published stable `vX.Y.Z` tag. The check verifies
the source run, version plan, Git tag, manifest, signed provenance, SPDX
inventory, every release asset, registry tags, and source-bound operator
guidance. Stable commits must belong to main. Preview verification also
checks for a duplicate run triggered by its preview tag. The report records
a same-channel comparison, an explicit first-release notice, or an explicit
changelog generation failure. Review any generation failure before upgrade.

The same scenario probes source, version, origin, asset-byte, and
registry-digest conflicts against the live release. It alters only local
proposed evidence and requires the specific conflict error from the
publication checks. A network or authentication error fails acceptance.
The probes use read-only preflight checks and confirm the live state again
afterward; they do not attempt a write with invalid evidence.

For a run whose required application, security, or candidate check fails,
select `failed-check` and supply its numeric run ID:

```sh
gh workflow run release-acceptance.yml --repo viscalyx/skyttel --ref main \
  -f scenario=failed-check -f release_run=RELEASE_RUN_ID
```

The check requires a failed gate, a skipped publisher, and no public release
for the original version plan. A publisher failure alone does not qualify.

For partial-publication recovery, preserve a baseline **before retrying**:

1. Select a failed release run with retained plan, candidate, and signed
   evidence artifacts. Its image tags must exist, and its draft GitHub
   release must contain some, but not all, expected assets. Other failure
   stages do not qualify for this scenario.
2. Run `snapshot-retry` with that run ID. Wait for success and retain the
   acceptance run ID. The snapshot contains the original evidence, draft
   identity, asset IDs and hashes, registry digests, and artifact identities.
3. Resolve the transient cause and retry the original container release
   run using GitHub's retry controls. Do not delete or replace its artifacts,
   release, or tags. Wait for the retry to succeed.
4. Run `verify-retry` with the original release run ID and the successful
   snapshot acceptance run ID.

```sh
gh workflow run release-acceptance.yml --repo viscalyx/skyttel --ref main \
  -f scenario=snapshot-retry -f release_run=RELEASE_RUN_ID

# After the snapshot and the original release retry both succeed:
gh workflow run release-acceptance.yml --repo viscalyx/skyttel --ref main \
  -f scenario=verify-retry -f release_run=RELEASE_RUN_ID \
  -f snapshot_run=SNAPSHOT_ACCEPTANCE_RUN_ID
```

Retry verification requires a later successful attempt of the same run,
completion of missing assets, identical existing asset IDs and bytes,
unchanged version, commit, digest, release text, and retained artifacts,
and byte-for-byte preservation of signed evidence. Attestation steps must
be skipped. If the candidate job runs again, its build step must be skipped.
An ordinary rerun of a complete release cannot satisfy partial-retry
acceptance. Missing or expired baseline evidence fails the check.
