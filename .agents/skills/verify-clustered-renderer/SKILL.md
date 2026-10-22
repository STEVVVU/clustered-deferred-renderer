---
name: verify-clustered-renderer
description: Launch and drive the real clustered WebGPU sample, export GPU evidence, and retain it after cleanup.
---

Status: proven on 2026-10-21 local (2026-10-22 UTC) using the visible CUA browser and Intel xe-lpg WebGPU adapter. Desktop and narrow runs completed Launch, Doctor, Drive, Evidence, Cleanup. See [retained proof](../../../docs/evidence/README.md).

## Launch
Use Node 24 or newer with the inherited lock: `npm ci --ignore-scripts`, `npm run build`, then `node node_modules/servez/bin/servez --port 8088 --local --no-scan out`. On this Windows host prepend `C:/Users/steve/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin` to PATH; invoke npm via `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js` to avoid Node 25. Keep the returned process ID. Open `http://localhost:8088/sample/clusteredRendering/` in a visible CUA browser only. No CDP, Playwright, or hidden page API.

## Doctor
Read the server output and HTTP status, then inspect the visible canvas and dat.GUI status. A successful HTTP response alone does not establish GPU readiness. Require status `Ready` and a lit scene; device failures must remain visible.

## Drive
Use the visible dat.GUI mode control to choose Naive forward, Clustered forward, and Clustered deferred. Toggle packed normals in deferred mode. Click `Verify GPU`, wait for the visible PASS/FAIL status, then click `Export evidence`. The app's maintained driver is `sample/clusteredRendering/verify.ts`: it submits real compute/render passes and maps GPU readbacks. Its only entry point is the visible action in `main.ts`.

## Evidence
Save the downloaded JSON and screenshots in `.agents/evidence/<run>/` (ignored generated run data), or the orchestrator's durable evidence folder. Record action, resulting status, browser/adapter, viewport, and exported file. JSON must contain exact GPU/CPU cluster membership comparisons, zero/dense/overflow/camera/depth-boundary cases, image errors across all modes, packed-normal angular error, and allocation payload bytes. Inspect pass flags; do not reinterpret FAIL as success. No speed claims from CPU time. Feature map: `features/README.md`.

## Cleanup
Close only the verification tab and stop only the server process created by Launch. Confirm exported JSON and screenshots still exist after cleanup. Do not kill by process name or remove evidence. If GPU driving is unavailable for a later run, report that run as blocked and name the missing prerequisite; historical proof does not verify new changes.

## Proven lifecycle
- Launch: inherited full build and owned loopback HTTP server on port8088, executor session25857.
- Doctor: HTTP200 plus main agent's visible Ready/lit procedural scene; actual Intel xe-lpg adapter identified by exported GPU evidence.
- Drive: main used native visible mode chooser for all three modes, packed checkbox, Verify GPU and Export evidence. Both 600×600 and resized390×600 GPU runs passed all six exact membership/image scenarios and4102 oct round trips.
- Evidence: compact reviewed export summary and synthetic-scene desktop/narrow screenshots are tracked under docs/evidence/. Raw desktop/narrow exports and preserved earlier failures remain in the external coursework evidence store.
- Cleanup: main closed owned tab11 and reset viewport; port8088 has no listener, and owned session25857 had already exited. Executor independently confirmed no8088 listener and retained proof files after cleanup. No unrelated process was stopped. Device-loss failure handling was code reviewed but loss was not injected; hosted CI does not execute GPU checks.
