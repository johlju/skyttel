# Large-map observations

The [measurement plan](large-map-performance.md) defines the dataset,
network and readiness boundaries. All values below are individual
observations in milliseconds, not percentile estimates.

## Baseline

Implementation base: `71b831f3cb14325360df38d0d2f655e10b46445f`.
Measured 2026-09-24 with headless Chromium 153.0.8010.12, Node 24.21.0,
Linux 7.0.12-linuxkit, ARM64, 1,440 × 1,000 viewport. The devcontainer
reported 10 available processors, 25,159,561,216 bytes of host memory and
no additional cgroup CPU or memory cap. CPU model was unavailable. Server
and browser shared this environment; there was one map client and no
competing map writes. Host load averages after the pair were 5.35/3.93/4.11.

| Run | Cache | Open | Search | Save | Labels | Overlaps |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Cold | 4542 | 618 | 838 | 2000 | 486925 |
| 1 | Warm | 4372 | 686 | 853 | 2000 | 486925 |

Time limits passed, but the overview failed readability. The fix limits
ordinary labels to available space, retains explicit all-label mode, and
pages long lists while keeping every entry reachable. Shared save and
authorization semantics remain unchanged.

## Initial optimized implementation

Measured clean implementation commit
`1fae0c0af36da404a4bb5d0eba7a41bf273b7733`, tree
`84bb55c67e3ff740912d0d2b0b87f9c0c1e8287a`, on 2026-09-24 at 21:44 UTC.
The browser, Node, Linux, architecture, viewport, memory and CPU limits were
the same as the baseline. No other test suite ran in this worktree during
measurement. Host load averages after the six observations were
2.33/2.78/2.79. Both runs used the plan's 20/5 Mbit/s, 40 ms connection.
The host load differed, so these are observed improvements, not an isolated
CPU comparison.

| Run | Cache | Open | Search | Save | Labels | Overlaps |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Cold | 2166 | 29 | 826 | 25 | 0 |
| 1 | Warm | 2061 | 31 | 828 | 25 | 0 |
| 2 | Cold | 2221 | 33 | 820 | 25 | 0 |
| 2 | Warm | 2060 | 31 | 834 | 25 | 0 |
| 3 | Cold | 2188 | 32 | 822 | 25 | 0 |
| 3 | Warm | 2084 | 35 | 815 | 25 | 0 |

All six observations met all three time limits and had no overlapping
overview labels. Values in the table are rounded to whole milliseconds;
the [raw report](measurements/large-map-2026-09-24.json) preserves precision
and environment metadata. Reread content and history matched every save;
after server restart the final content, history and successful operation
contained the same durable receipt. Visual inspection confirmed that
selected paths remained distinct from the faded background connections.

The full check on this product code passed: 414 Vitest tests, 135 Playwright
tests, release/security gates, typecheck, lint, documentation checks and
production build. Coverage was 93.69% statements, 90.64% branches, 93.57%
functions and 95.39% lines, with thresholds unchanged. The large-map browser
case visited every object and relationship page, searched the last object,
returned to off-page selected content, focused its connections, preserved
unsent text across views, saved and reread after restart. It also preserved
25 coincident personal positions and rejected anonymous/revoked access.
The existing directed-arrow, lifecycle, personal movement and concurrency
cases remained green. Manual physical-device execution is not claimed.

No production-host capacity or physical target-device result is inferred
from this environment. The client bundle warning above 500 kB still appears;
the measured production bundle nevertheless met the stated connection
targets. More history, larger images, concurrent load or a different device
can change the results and should be recorded when repeating the plan.

## Prototype-aligned implementation

The measurement at 2026-09-25 06:25 UTC uses clean commit
`caa5f068bb21031ae80a2ebe684771578a011678`, tree
`55b50a03a2cc71728535d2274fdd922330d10bfd`. This version includes the approved
spatial presentation and explicit editing controls. The measurement reads
the separate name labels and opens **Redigera valt objekt** before editing.
Its readiness, timing, overlap and durability assertions are unchanged.

The environment, browser, Node version, viewport and connection are the
same as above. No competing test suite runs during this measurement.
Host load averages at completion are 3.42/4.03/2.72. The
[raw report](measurements/large-map-2026-09-25.json) records the complete
environment, exact values and clean worktree.

| Run | Cache | Open | Search | Save | Labels | Overlaps |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Cold | 2912 | 41 | 866 | 13 | 0 |
| 1 | Warm | 2738 | 44 | 853 | 13 | 0 |
| 2 | Cold | 2881 | 47 | 853 | 13 | 0 |
| 2 | Warm | 2871 | 38 | 842 | 13 | 0 |
| 3 | Cold | 2787 | 36 | 857 | 13 | 0 |
| 3 | Warm | 2784 | 44 | 839 | 13 | 0 |

All six observations meet the original limits: opening within 5 seconds,
search within 1 second and saving within 2 seconds. Overview labels have
no overlapping pairs. Every saved description matches the reread content
and history; after restart, content, history and operation agree on the
same durable receipt. This is a local synthetic-data result, with no
physical-device or production-host claim.
