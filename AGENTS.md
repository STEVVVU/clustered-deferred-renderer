# Clustered renderer project instructions

Preserve the full upstream WebGPU Samples tree, license, authors, history, original examples, and README.upstream.md. New renderer code lives in sample/clusteredRendering/. Use the existing dat.GUI, wgpu-matrix, shader loader, gallery metadata, and build tooling. Do not add frameworks or change public upstream sample APIs for this extension.

Use Node 24 and inherited npm package-lock.json. Commands: npm ci --ignore-scripts; npm run lint; npm run test:clustered; npm run typecheck; npm run build. Typecheck targets the new sample only; full upstream tsc retains documented pre-existing failures. The full build emits inherited type warnings. Preserve the distinction in reports.

For real GPU checks read .agents/skills/verify-clustered-renderer/SKILL.md and its feature map. Use a visible browser and the real Verify GPU / Export evidence controls. Do not substitute CPU tests or hidden page APIs for GPU evidence. Keep failed exports, capture exact diagnostics, and fix a reproduced cause before adjusting algorithms. Do not weaken tolerances or exact assertions merely to pass. Do not claim physical allocation or speedup from logical byte counts or CPU timing.

Run the documented HTTP-only loopback server. Residual dependency advisory boundaries are in .agents/dependency-notes.md; do not introduce user-controlled Markdown or self-signed HTTPS. Deploy workflow remains disabled. No push, deployment, or publication is implied by local checks.
