## Sub-features
GPU cluster readback, CPU oracle, image comparisons, overflow fallback, octahedral error, export, device/error visibility.
## How to get to it (user POV)
Click Verify GPU, inspect status, then Export evidence.
## Driving it with CUA
Download the real JSON, inspect every case and aggregate pass, and preserve a screenshot showing the final status. Check membership/count equality and image tolerances, including deliberately overflowing clusters. Export before cleanup.
## Gotchas
No browser run means GPU correctness remains unverified. A validation error or lost device must produce an explicit failure, never a CPU-rendering substitute. Verification has no timestamp speedup claim.
