# Background performance observations

All 72 measurements of the integrated client meet the frozen local budget:
response median/p95 at most 1000/1750 ms and full-frame pipeline median/p95
at most 180/800 ms. The largest observed response median/p95 is 388/550 ms;
the largest full-frame median/p95 is 28/281 ms. These are local SwiftShader
regression observations. Physical GPU/mobile and extended-use verification
remain a separate tester follow-up.

## Final source verification

The final production source
`92aa02f0d4c63750ddb84d76c1e497d808fa5bd8` shares synthetic map preparation
between appearance checks and profiling, and groups the ocean projection
inputs. Fixture data, UI preparation, rendering calculations and the
frozen budget remain unchanged. Its complete default profile has 72 cells,
864 responses, 5658 full presentations and zero violations. Resource,
placement and idle-image checks all pass. The largest observed medians
and p95 values appear above; individual cells and exact environment,
settings and asset metadata are in the
[readable final report](measurements/background-final-summary.json).
The [raw final trace](measurements/background-final.json.gz) retains every
observation and complete trace events. The exact final JS SHA-256 is
`46212566f0b934de0f8dc5b710b041744d57d3e946c610c99d5a4921b85e6d05`.

## Combined production verification

The combined run includes the connection contrast surrounds, settings
changes and all background optimizations. It uses the committed default
of two rounds with 12 completed PNG observations per cell: 72 measured
cells and 864 responses, with the same panels, sizes, widths and seven
appearances as the paired comparison below. The frozen budget is unchanged.

The first combined production version, source
`25a6de380950d5914a921e93721fee046da111a4`, exceeds the frame median limit
in one cell: dense desktop Universe, first round, 183.299 ms against
180 ms. Its second round is 131.412 ms. Both response limits, every frame
p95 and all resource, placement and idle checks pass. This complete failed
measurement remains available as a
[readable report](measurements/background-combined-before-summary.json) and
[raw trace](measurements/background-combined-before.json.gz).

The integrated repair, source
`15e1c1fd407979d1c379633b9e86d59c4df3a217`, bounds connection mask surfaces
to the shaft control hull or arrow tip, with conservative paint margins.
It preserves stroke widths, colors, occlusion geometry, depth and all
motifs. A controlled Chromium raster comparison of the actual depth SVG
in 12 existing movement and camera states produces zero changed RGBA
pixels when only those mask regions expand to the former viewport bounds.
Full composed-page screenshots can differ at unrelated antialiased edges
after such a mutation; the equality result applies to the isolated SVG.
All 37 spatial graphics tests, the painted-arrow regression and 28 dense
desktop contrast captures across all seven appearances pass after repair.

The complete repaired profile has zero violations and 5634 full-frame
samples. Resource counts stabilize after warm-up, saved placements remain
unchanged and idle full-page images remain identical. Dense desktop
Universe frame medians are 26.490/26.727 ms across the two rounds;
response medians are 380.417/419.653 ms. Every measured cell, its median
and p95, frame-state counts and settings are in the
[readable repaired report](measurements/background-combined-after-summary.json).
The [raw repaired trace](measurements/background-combined-after.json.gz)
retains individual observations and complete trace events. Both reports
identify source, exact built assets and hashes, browser, environment and
the same software graphics device described below. The repaired JS SHA-256
is `2ce402c19d0ddbbe748bbd53057a986066079612f6d1acddf065b4854f4d3417`.

## Method and production versions

Follow the [measurement plan](background-performance.md). Each paired run
covers all seven appearances and background off in both themes, 16/80
objects with connections, 1440 × 960 and 390 × 844, with navigation and a
real object details panel open. The operation is the ordinary **Rotera
vänster** button activated with Enter. Both runs use one round of eight
completed full-page PNG observations per cell (288 responses per run).
Settings are outside timing. The optimized harness also explicitly checks
and records persisted visibility and the active theme's choice before each
cell. The default committed command uses two rounds of 12 observations;
that broader combined-production check is separate from this paired run.

Response includes the complete page, browser input, compositing, PNG
readback/encoding and transport. It is a conservative observed response,
not a button-handler duration. Frame latency is Chromium
`PipelineReporter` from frame beginning to `STATE_PRESENTED_ALL` only;
partial presentations, dropped attempts and capture-paced screencast gaps
are separate. It measures the browser pipeline with capture/tracing
overhead, not physical display delay or hardware GPU throughput.
Nearest-rank percentiles describe the finite observations, without a
population percentile guarantee; with eight responses the p95 is the max.

Both runs use headless Chromium 156.0.8078.4, Node 24.21.0, npm 12.0.2,
Linux 7.0.14-linuxkit arm64 in the development container, CPU model unknown,
ten available execution units and 25,159,561,216 bytes reported memory.
Cgroup CPU quota is `max 100000` and memory limit is `max`. The graphics
device is ANGLE, SwiftShader 5.0.0, Vulkan 1.3.0, LLVM 10.0.0: software
rendering. Browser and server share the container without artificial CPU
or network throttling. Device pixel ratio is 1, with no mobile/touch
emulation. Other build/test commands are excluded through the shared npm
process lock; external host activity remains uncontrolled.

- Reference: 2026-10-17 18:17:47–18:21:23 UTC, source
  `cb1ca3326278496d2eaa66daf62175c3327cfece`, completion load 2.88/2.53/1.99.
  The retained built client precedes optimization edits; later working-tree
  metadata in the report does not describe that already-built production
  source. Its exact JS SHA-256 is
  `3a7b09743fb5a111c362479a96a5dd133cc531456cb5ca5d4999442b6f4790e6`.
- Optimized: 2026-10-17 18:49:39–18:52:51 UTC, production source
  `037fc6588a7608b710106fe8be3ed149e9fd6978`, completion load 2.58/3.01/2.65.
  JS SHA-256 is
  `325231f38002f8886a7c80774a334f2ed9062451295d90f06d6a3811d5092697`.
  Production sources have no pending edits; report metadata lists pending
  profiling/test/documentation work separately.

Reports record exact built HTML and every JS/CSS asset hash, browser and
GPU identification, environment, settings, individual observations and
resource counts. See the [readable reference](measurements/background-before-summary.json),
[readable optimized report](measurements/background-after-summary.json),
[complete reference trace](measurements/background-before.json.gz) and
[complete optimized trace](measurements/background-after.json.gz).
Decompress `.json.gz` with `gzip -dc`; original trace events, matched spans
and all frame states remain available.

## Frozen measurement-based local budget

The [budget file](measurements/background-budget.json) uses only the eight
background-off reference cells across both themes, sizes and widths.
Take the largest off-cell median, p95 and median absolute deviation (MAD).
The median cap adds one observed MAD; the p95 cap adds two observed MADs.
Round response limits upward to 50 ms and full-frame limits upward to
10 ms. This engineering allowance uses measured local jitter. Limits are
fixed before optimized measurement; optimized/background results do not
set them. No arbitrary FPS requirement is attributed to the design.

<!-- markdownlint-disable MD013 -->
| Metric (ms) | Largest off median | Largest off p95 | Largest off MAD | Median cap | p95 cap |
| --- | --- | --- | --- | --- | --- |
| Complete-page response | 733.597 | 1259.092 | 233.499 | 1000 | 1750 |
| Full-frame pipeline | 95.869 | 641.858 | 75.879 | 180 | 800 |
<!-- markdownlint-enable MD013 -->

The full-frame summary is a correction of the initial mixed full/partial
summary, using the same original off-only events. That correction precedes
any optimized measurement. Primary timing uses only `STATE_PRESENTED_ALL`,
because partial updates can retain older regions. The corrected 180/800 ms
limits replace the mixed-state 130/730 ms limits because the metrics differ;
original mixed summaries remain in the reference raw report. No optimized
result contributes to this correction.

The reference dense desktop Universe has response median 1033.740 ms and
full-frame p95 875.360 ms, exceeding 1000/800 ms. The optimized client has
zero violations. The profiler exits unsuccessfully on a budget violation,
missing/incomplete full-presentation trace, changed saved placements,
changing idle image or graphics resource growth after warm-up.
These limits define a conservative local envelope of the existing dense
map under this workload, not a physical-device latency promise.

## Every paired configuration

All entries are **median/p95 milliseconds**, rounded to whole numbers;
raw reports preserve precision. Each response cell has eight observations.
Full presentations vary with browser scheduling: the optimized run has
21–69 full-frame spans per cell, 1905 total. Reference has 1940 full spans.

<!-- markdownlint-disable MD013 -->
| Objects/width | Theme/appearance | Response before | Response after | Full frame before | Full frame after |
| --- | --- | --- | --- | --- | --- |
| 16/1440 | light/off | 118/218 | 109/215 | 44/120 | 43/114 |
| 16/1440 | light/pearl | 149/234 | 136/220 | 43/131 | 44/91 |
| 16/1440 | light/dawn | 210/273 | 172/226 | 42/136 | 44/109 |
| 16/1440 | light/ocean | 351/431 | 298/329 | 43/162 | 32/165 |
| 16/1440 | dark/off | 111/200 | 107/148 | 52/90 | 60/94 |
| 16/1440 | dark/atmosphere | 188/245 | 149/190 | 41/131 | 46/131 |
| 16/1440 | dark/mist | 178/248 | 163/185 | 45/142 | 44/141 |
| 16/1440 | dark/universe | 651/745 | 352/428 | 44/567 | 42/301 |
| 16/1440 | dark/ocean | 470/572 | 287/301 | 43/461 | 39/236 |
| 16/390 | light/off | 50/114 | 50/144 | 21/72 | 21/46 |
| 16/390 | light/pearl | 66/68 | 68/95 | 26/45 | 24/49 |
| 16/390 | light/dawn | 72/100 | 63/107 | 23/47 | 22/39 |
| 16/390 | light/ocean | 93/118 | 73/116 | 27/81 | 28/57 |
| 16/390 | dark/off | 50/62 | 50/52 | 19/44 | 27/44 |
| 16/390 | dark/atmosphere | 67/101 | 64/117 | 21/47 | 27/45 |
| 16/390 | dark/mist | 69/103 | 68/102 | 24/51 | 21/40 |
| 16/390 | dark/universe | 184/216 | 132/167 | 36/157 | 36/96 |
| 16/390 | dark/ocean | 150/168 | 102/150 | 23/123 | 36/105 |
| 80/1440 | light/off | 734/1259 | 767/1056 | 96/642 | 90/599 |
| 80/1440 | light/pearl | 539/780 | 439/732 | 87/417 | 87/328 |
| 80/1440 | light/dawn | 666/774 | 633/738 | 88/423 | 92/415 |
| 80/1440 | light/ocean | 664/875 | 653/863 | 87/406 | 92/388 |
| 80/1440 | dark/off | 522/649 | 513/700 | 89/377 | 98/384 |
| 80/1440 | dark/atmosphere | 551/700 | 532/686 | 93/407 | 135/390 |
| 80/1440 | dark/mist | 528/795 | 494/748 | 89/407 | 133/392 |
| 80/1440 | dark/universe | 1034/1165 | 772/850 | 87/875 | 90/552 |
| 80/1440 | dark/ocean | 935/1127 | 714/930 | 106/674 | 94/477 |
| 80/390 | light/off | 233/317 | 201/305 | 87/186 | 97/183 |
| 80/390 | light/pearl | 167/252 | 170/236 | 69/172 | 66/151 |
| 80/390 | light/dawn | 216/299 | 211/292 | 82/130 | 78/140 |
| 80/390 | light/ocean | 220/350 | 213/346 | 75/183 | 73/184 |
| 80/390 | dark/off | 168/297 | 183/250 | 69/127 | 73/121 |
| 80/390 | dark/atmosphere | 217/330 | 211/322 | 84/158 | 82/203 |
| 80/390 | dark/mist | 187/285 | 184/265 | 70/134 | 69/154 |
| 80/390 | dark/universe | 326/416 | 244/491 | 76/244 | 74/172 |
| 80/390 | dark/ocean | 292/370 | 238/341 | 86/246 | 80/157 |
<!-- markdownlint-enable MD013 -->

Reference also records 711 partial updates, 4405 dropped attempts and
787 no-update attempts; optimized records 669, 3657 and 761 respectively.
Every cell exposes counts, median and p95 by state, plus full and partial
sample arrays in the readable reports. Dropped/partial distributions are
part of stall investigation, not proof of smooth physical presentation.
Capture-paced cadence includes serial PNG/input pauses and is never
substituted for frame latency.

## Preserved behavior and resource observations

Exact reuse avoids duplicate decorative paint and duplicate DOM projection
notifications when their inputs are unchanged. State updates remain
synchronous. Actual camera/content changes, resize, background settings
and graphics restoration invalidate their appropriate work. Existing
shader equations, material resolution, underwater planes and all six
animal forms are retained. Local inspection of the resulting desktop
captures confirms the seven expected appearances, including stars, haze,
ocean surface/seabed and visible animal motifs. The existing motif cases
remain the detailed identity checks.

The focused BAKGRUND-05, PLACERING-15 and PLACERING-16 run passes in
7.9 minutes. For all seven appearances, case 05 performs inverse full
turns, repeated pan, both zoom limits, zero/full strengths, layer distances
0.5/2, object movement and three off/on cycles, with exact comparisons of
common unobscured background pixels and positive changed-motion controls.
Ordinary near/far full-page captures are retained by Playwright. Cases
15/16 verify all-seven reduced-motion freeze/resume and resets at desktop
and narrow 80-object layouts. RYMD-04 also passes viewport, touch and
graphics-context recovery. Pixel equality retains zero tolerance.

Each profile makes four full nine-choice cycles per object count after
timing. Both before and after have stable live WebGL counts every cycle:
24 buffers, 8 textures, 6 programs, 6 framebuffers, 6 vertex arrays,
0 shaders and 0 renderbuffers. Ordinary logout removes the canvas and
reduces buffers/programs/vertex arrays to zero. Eight textures and six
framebuffers remain observed in the renderer context until browser-context
teardown. The observer counts explicit creation/deletion; actual driver
memory release is not measured. Both two-second idle page comparisons
are identical, and navigation preserves saved object positions in all cells.

After garbage collection, optimized JavaScript heap ranges 18.6–19.3 MB
for 16 objects and 23.2–29.1 MB for 80 objects; the latter ends at 27.3 MB.
Reference ranges are 18.5–19.4 and 23.5–27.2 MB. Stable graphics counts and
these short heap observations do not prove absence of leaks or establish
multi-hour thermal stability. Dense labels can still be hidden and
floating panels can obscure pointer targets. Profiling uses ordinary
keyboard actions for covered close/navigation controls; it does not force
clicks through UI or claim all dense labels are readable. Combined
readability/contrast changes require the final combined-production profile.

## Additional raw evidence and follow-up

The [initial navigation-only reference](measurements/background-navigation-before.json)
contains the earlier 36-cell run with eight responses each. It has no
object details panel or frame trace and is not the paired comparison.
Its compositor gaps include capture/input idle time and are not pure
render durations.

The interrupted optimized attempt ends with exit 143 after 20/36
cells, with no application traceback or budget failure. Its
[partial raw artifact](measurements/background-interrupted-after.json.gz)
is incomplete and excluded from the paired result. The signal's origin
remains unknown. The complete replacement run uses the same workload and
unchanged caps and completes successfully.

Representative accelerated GPU and physical mobile testing, real touch
interaction, higher pixel density, longer use, power/temperature behavior
and actual driver-memory release remain unverified here. Run the documented
command and manual case on that hardware, record the actual environment
and keep its evidence separate from SwiftShader. No real model/voice calls
or deployment are used for these observations.
