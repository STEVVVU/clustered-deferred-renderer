# Clustered renderer feature map

| Feature | Driver | Proof |
| --- | --- | --- |
| Three rendering modes and packed normals | [rendering](rendering.md) | Lit canvas and image readback comparisons |
| Compute cluster assignment and fallback | [verification](verification.md) | GPU membership equals independent CPU oracle; overflow image equals naive |
| Evidence export and failure visibility | [verification](verification.md) | Visible status and downloaded JSON survive cleanup |
