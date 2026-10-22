## Sub-features
Naive forward, compute-culled 3D clustered forward, clustered deferred, packed octahedral G-buffer, light count, camera orbit, freeze, resize.
## How to get to it (user POV)
Open `/sample/clusteredRendering/`; use the inherited dat.GUI controls.
## Driving it with CUA
Change each mode and packed flag, adjust lights to zero and maximum, unfreeze and orbit. Resize the visible window. Capture each state. Run Verify GPU for deterministic image readbacks at a shared camera/light state.
## Gotchas
WebGPU requires a supported browser/GPU on a secure origin or localhost. Verification pauses motion and restores controls. Packed textures report logical texel payload, since physical allocation is implementation-specific.
