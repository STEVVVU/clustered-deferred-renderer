# Reviewed local GPU proof

These artifacts capture the app's synthetic procedural scene, without account data. Main agent drove the real visible browser; the executor inspected the final screenshots and exported JSON. Independent renderer review approved the source and GPU proof before commit.

- [Desktop capture](final-desktop.png): actual1280×720 viewport,600×600 canvas, inherited dat.GUI shell, visible PASS status.
- [Narrow capture](final-narrow.png): actual390×844 viewport,390×600 canvas, reachable controls, document scrollWidth390. Packed toggle is off in this capture, demonstrating the unpacked comparison state.
- [Compact reviewed GPU summary](gpu-reviewed-proof.json): actual desktop and narrow exports, raw-export SHA256 values, six scenario outcomes, exact cluster mismatches, image errors, lighting-response deltas, octahedral error, and logical byte counts. Both aggregate pass flags are true. This is evidence from real GPU execution, not a fixture used to assert future success.

Raw exports, additional mode captures, reference screenshots and earlier failed diagnostic runs remain at `C:/Users/steve/.codex/orchestrate/coursework30-20261021/evidence/P18/`. They are deliberately not all added to the source tree. In both final runs the adapter reports Intel xe-lpg; no other GPU is claimed. Mode chooser and packed toggle were exercised through their visible controls. All six scenarios have zero exact membership mismatches, all image comparisons pass, and4102 GPU oct round trips have maximum angular error0.0034424956° below0.01°.

Cleanup completed: main closed verification tab11 and restored viewport; owned server session25857 exited. Executor independently confirmed no port8088 listener and retained these artifacts after cleanup. No unrelated process was stopped. Device-loss failure handling was reviewed but device loss was not injected. No GPU timing, physical texture allocation, or hosted-CI GPU result is claimed.
