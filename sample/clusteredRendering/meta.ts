export default {
  name: 'Clustered Forward and Deferred Rendering',
  description:
    'Three lighting paths over a deterministic procedural room: naive forward, compute-culled 3D clustered forward, and clustered deferred. Optional packed octahedral normals. The visible verification action compares GPU readbacks against a CPU cluster oracle and reference images.',
  filename: __DIRNAME__,
  sources: [
    { path: 'main.ts' },
    { path: 'render.wgsl' },
    { path: 'math.ts' },
    { path: 'verify.ts' },
  ],
};
