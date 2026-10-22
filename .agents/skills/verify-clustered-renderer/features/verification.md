## Sub-features

The visible Benchmark action drives six frozen resolution, light and geometry workloads. It compares naive forward, clustered forward, float deferred and packed deferred with the existing image tolerances before timing, then requires each repeat-end image to exactly match its checked frozen image. Ten warm frames precede seven rotated repeats of twenty frames. Export retains raw frame times, p50, p95, CPU queue-completion time, GPU timestamp spans when supported, diagnostic stage intervals, and logical allocation bytes. Resolution is 640x360 or 1280x720, lights 64/256/1024, and geometry 27 or 627 procedural boxes. Main drove visible in-app-browser Verify GPU and Benchmark to PASS on 22 October 2026, exported both JSON receipts and closed its tab/server. Intel xe-lpg supported timestamps; results are not RTX measurements. All 24 combinations, 3,360 timed frames and 168 repeat-end image oracles passed; `docs/evidence/benchmark/metrics-summary.json` retains all rows/repeat distributions and raw receipt hashes. No device timestamp support means GPU fields remain null, with CPU timing explicitly labeled. Packed/float ranges overlap and timestamp quantization limits small differences.
GPU cluster readback, CPU oracle, image comparisons, overflow fallback, octahedral error, export, device/error visibility.
## How to get to it (user POV)
Click Verify GPU, inspect status, then Export evidence.
## Driving it with CUA
Download the real JSON, inspect every case and aggregate pass, and preserve a screenshot showing the final status. Check membership/count equality and image tolerances, including deliberately overflowing clusters. Export before cleanup.
## Gotchas
No browser run means GPU correctness remains unverified. A validation error or lost device must produce an explicit failure, never a CPU-rendering substitute. Verification has no timestamp speedup claim.
