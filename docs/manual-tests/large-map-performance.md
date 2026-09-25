# Large-map measurement plan

This guide is for developers checking map readability and response times.
The test level is 500 objects and 1,500 relationships, not a storage limit.
Run the functional checks separately from timing measurements:

```sh
npm run build
npm run test:integration -- tests/integration/large-map.spec.ts
MAP_REPORT=/tmp/map-results.json npm run measure:map
```

The measurement command builds the production client and starts the real
application with a temporary SQLite database, WAL and full synchronization.
Only the external sign-in provider is substituted. Test fixture code is
outside the production server build. No live credentials or household data
are needed. The default run makes three cold/warm pairs, then restarts the
server and checks the persisted object, history and operation receipt.
`MAP_RUNS` changes the number of pairs. `MAP_SCREENSHOT=/tmp/map.png` keeps
an overview screenshot. `MAP_PAUSE=1` prints the local installation address
and waits for Enter before measuring, for manual synthetic-data inspection.
Forward its printed port from the devcontainer if using the host browser.
Press Enter only after returning the fixture to its initial content, or
restart the command for an unmodified measurement dataset.

## Dataset and connection

`tests/support/large-map.ts` deterministically arranges 500 numbered objects
across five types and 1,500 directed relationships across three types. Twenty
groups of 25 have dense local connections. Known, unknown, explicitly absent
and uncertain values, unspecified identities and ended status are present.
IDs and topology are repeatable; no random content is omitted. Catalog IDs
and the synthetic household ID are installation-specific. The functional
test additionally puts 25 objects at exactly the same personal position.

For this plan, **normal connection** means Chromium network emulation at
20 Mbit/s download, 5 Mbit/s upload and 40 ms latency, with no packet loss.
CDP applies it to browser traffic, including scripts and API requests.
Post-measurement assertions use unthrottled public HTTP and are not counted
as user-visible latency. The server and browser run locally over HTTP; this
does not measure DNS, remote TLS, an internet route or production hosting.
There is one active map client, no competing writes and no AI request.

Cold means a fresh browser context with an empty browser cache. Warm means
a later navigation in the same context. The server process and operating
system cache stay warm; this is not a cold machine or deployment benchmark.
CPU is not artificially throttled. Reports record the actual browser,
Node version, architecture, visible CPU/memory limits, host load, viewport,
commit/tree and uncommitted files. These observations establish no minimum
hardware requirement or percentile guarantee.

## Measurement boundaries

- Open: navigation starts until the real 500/1,500 counts, selectable list
  content, rendered spatial labels and enabled camera navigation are ready.
  Opening the navigation controls is included. Limit: 5 seconds.
- Search: entering the final numbered object's name until its visible list
  result appears and the filtered list contains that object. Limit: 1 second.
- Save: pressing Save from a finished, conflict-free private draft until the
  receipt-backed success message appears. The ordinary edit changes an
  object's description. Registration and atomic server save are included;
  preparing the draft and later verification reads are excluded. Limit:
  2 seconds. The server transaction, history and receipt logic are unchanged.
- Readability: count actual rendered label rectangles and overlapping pairs.
  The normal overview must have no overlapping labels. Explicit all-label
  mode retains its denser presentation. Deterministic priorities favor the
  selected content, incident edges and proposals; other labels use stable IDs.

The command writes each observation and exits unsuccessfully if a timing
limit or overview overlap check fails. It does not run in the parallel CI
suite, where unrelated load would make timing comparisons ambiguous. CI
does run real-browser readability, full list traversal, search, focused
editing, draft preservation and restart persistence checks. Existing fault,
membership and concurrency tests continue separately with their original
save semantics.

## Limits and verified environment

The recorded measurements use headless Chromium on Linux in the development
container, with a production Vite client and the real application loaded by
the test fixture through tsx. They do not establish physical Chrome behavior
on Windows, macOS, iPhone or iPad, or the capacity of the production server.
The approved target platforms and deferred verification boundaries are
unchanged. User-created pictures are not included in this numbered fixture;
image decoding and image access have separate coverage.

See [individual observations](large-map-results.md) for baseline and final
results. Fix and report missed limits instead of relaxing the targets.
