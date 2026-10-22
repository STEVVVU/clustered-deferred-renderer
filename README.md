# Clustered deferred renderer

A coursework extension of the complete [official WebGPU Samples](https://github.com/webgpu/webgpu-samples) tree at `e040ec1a20dbbe01afed30c812e825b2639cfe5b`. Original history, samples, author notices, APIs, assets, [BSD-3-Clause license](LICENSE.txt), and [original README](README.upstream.md) are retained. New work is in `sample/clusteredRendering/`; no student skeleton or solution code is used.

## Run

Use Node 24 and the existing npm lockfile:

```sh
npm ci --ignore-scripts
npm run lint
npm run test:clustered
npm run typecheck
npm run build
node node_modules/servez/bin/servez --port 8088 --local --no-scan out
```

Open `http://localhost:8088/sample/clusteredRendering/` in a WebGPU-capable browser. The gallery also lists the new sample. Choose Naive forward, Clustered forward, or Clustered deferred in dat.GUI. Set light count (0–1024), freeze light motion, orbit the camera, and switch packed normals. Resize recreates bounded render targets (maximum 1200×1200). Adapter, device-loss, shader, and validation failures are displayed; there is no CPU rendering substitute.

On the development Windows host use `C:/Users/steve/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe` and `C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js` explicitly; the default npm shim selects Node 25. The production build now invokes Rollup through `process.execPath` instead of a Unix shell path, fixing the reproduced Windows build failure. `npm start` retains the original upstream development watcher. Deployment is disabled; the added CI job has read-only permissions and runs static/CPU checks, with GPU verification explicitly local.

## Added behavior

The new scene is generated from boxes in code, without external model or texture assets. All three paths use the same vertices, camera, diffuse lighting, bounded light spheres, and output transfer curve. Naive forward evaluates every light per fragment. Clustered forward first dispatches compute culling against a 12×12×16 logarithmic view-space grid; each cluster owns its light indices. Clustered deferred writes a G-buffer, then reconstructs view position from depth and applies cluster lighting in a separate fullscreen pass. Every sphere intersecting a conservative cluster AABB is included. Each list stores 64 indices and the full intersection count; an overflowing cluster evaluates all lights instead of silently dropping them.

The official inherited `deferredRendering` sample already provides its own normal/albedo/depth G-buffer, per-pixel all-light deferred shading, depth position reconstruction, and compute light motion. Those are upstream features, not contributions of this extension. The inherited `clusteredShading` entry is an external demo link; the new sample is local and independently verifiable. Light motion in the new sample uses deterministic CPU input updates; culling and rendering execute on the GPU.

## Research extension and measurement

Grid bounds are canonical outward-rounded Float32 inputs built once per resize/projection; all light membership and list construction remain in compute. This avoids divergent CPU/GPU transcendental rounding at near-tangent sphere boundaries. Independent CPU predicates consume the same packed grid/light inputs; a separate test proves that all mathematical and uploaded-projection frustum corners lie within their AABBs. Five CPU tests now include that coverage and the observed light383/cluster1638 regression.

[Cigolle et al., 2014, *A Survey of Efficient Representations for Independent Unit Vectors*](https://jcgt.org/published/0003/02/01/paper-lowres.pdf) motivates octahedral normals: L1 projection, lower-hemisphere fold, signed normalized quantization, then unfold and normalize. The implementation uses a sign-not-zero function at fold boundaries, `pack2x16snorm`, and `unpack2x16snorm`. A packed `rg32uint` target holds one normal word and one `pack4x8unorm` albedo word. The comparison path uses `rgba16float` normal plus `rgba8unorm` albedo. Both share `depth32float` and reconstruct position; neither stores a position target.

For W×H pixels, created G-buffer logical payload is `12WH + 8` bytes unpacked versus `8WH + 12` bytes packed, including inactive 1×1 binding placeholders. Savings are `4WH - 4` bytes (approximately one third); shared depth/output add `8WH` bytes. These are exact texel payload calculations for the created textures, **not a physical driver-allocation measurement**. WebGPU does not expose physical image allocation. No speedup, GPU timing, or FPS claim is made.

The coursework requirements are [CIS5650 Fall 2025 Project 4](https://github.com/CIS5650-Fall-2025/Project4-WebGPU-Forward-Plus-and-Clustered-Deferred/blob/main/INSTRUCTIONS.md). The clustering reference is [Olsson et al., 2012, *Clustered Deferred and Forward Shading*](https://www.highperformancegraphics.org/previous/www_2012/media/Papers/HPG2012_Papers_Olsson.pdf). These are algorithm/requirements references; no third-party solution implementation is copied.

## Verification and results

The maintained [verification skill](.agents/skills/verify-clustered-renderer/SKILL.md) and [feature map](.agents/skills/verify-clustered-renderer/features/README.md) specify Launch, Doctor, Drive, Evidence, Cleanup. Use visible **Verify GPU**, inspect PASS/FAIL, then **Export evidence** to download JSON. The real GPU driver is [verify.ts](sample/clusteredRendering/verify.ts); no hidden page API is required. It maps compute lists and render images, independently checks CPU sphere/AABB membership and count, compares all three rendering paths and both G-buffers at the same camera/lights, tests zero/maximum/dense-overflow/orbit/depth-boundary scenarios, and executes 4102 GPU octahedral round trips. Pixel tolerances are 1 byte for naive/clustered forward, 3 for naive/unpacked deferred, and 2 for unpacked/packed deferred; octahedral angular tolerance is 0.01 degree. Export includes observed errors and all case flags.

Current evidence: five CPU tests, new-sample typecheck, and full repository lint pass; full build succeeds with inherited TypeScript warnings. Actual visible CUA GPU runs pass at 600×600 desktop and 390×600 narrow canvas sizes on Intel xe-lpg. All six scenarios have zero exact cluster membership mismatches; image errors are at most1 byte; 4102 GPU octahedral samples have maximum angular error 0.0034424956° below 0.01°. Seeded/dense lighting responds materially against zero-light images, so mode agreement is not vacuous. See [reviewed GPU proof and screenshots](docs/evidence/README.md). Native mode chooser and packed toggle were exercised; narrow 390×844 viewport has reachable controls and scrollWidth 390. The verification tab was closed and port 8088 has no listener; evidence survived cleanup. `npm run typecheck` is deliberately scoped to the added sample: whole-tree `tsc -p sample/tsconfig.json --noEmit` still fails pre-existing typed-array upload mismatches and packedIntegerDotProduct errors, without global suppression. Successful scoped CI must not be read as a clean whole-tree typecheck.

## Dependency and operational limits

Compatible locked dependency updates and removal of unused `rollup-plugin-copy` reduced the observed npm audit count from 20 to 4 packages (1 moderate, 3 high). The remaining `servez-lib → selfsigned → node-forge` advisory has no fixed registry release as inspected; it concerns certificate signature verification. The documented local verification server uses loopback HTTP and does not enable self-signed HTTPS. Showdown has unfixed parsing/XSS advisories; its inherited use converts trusted repository-owned sample descriptions, with no new user HTML input. Do not expand these trust boundaries without addressing their advisories. See [dependency notes](.agents/dependency-notes.md).

The complete local verification lifecycle and independent source/GPU review are recorded in the [verification skill](.agents/skills/verify-clustered-renderer/SKILL.md). Device-loss handling was reviewed but loss was not injected; other GPUs and remote CI have not been run. The original build/deployment workflow bytes are [archived outside the executable workflow directory](docs/upstream-workflows/README.md); the sole active workflow is read-only, uses source-verified pinned current official checkout/setup-node actions, and supports manual dispatch. The project retains the upstream gallery and all examples, including their individual platform/experimental-feature requirements. No cloud deployment or external credentials are required.
