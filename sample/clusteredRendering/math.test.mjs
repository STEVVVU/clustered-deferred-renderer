import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mat4 } from 'wgpu-matrix';
import {
  CLUSTERS,
  GRID,
  NEAR,
  FAR,
  FOV,
  MAX_LIGHTS,
  clusterMembers,
  clusterBounds,
  octRoundTrip,
  seededLights,
} from './math.ts';

test('canonical f32 bounds contain every mathematical and uploaded-projection frustum corner', () => {
  for (const aspect of [0.5, 1, 2]) {
    const bounds = clusterBounds(aspect);
    const projection = mat4.perspective(FOV, aspect, NEAR, FAR);
    for (let cell = 0; cell < CLUSTERS; cell++) {
      const x = cell % GRID[0],
        y = Math.floor(cell / GRID[0]) % GRID[1],
        z = Math.floor(cell / (GRID[0] * GRID[1]));
      for (const k of [z, z + 1])
        for (const u of [x, x + 1])
          for (const v of [y, y + 1]) {
            const depth = NEAR * Math.exp((Math.log(FAR / NEAR) * k) / GRID[2]);
            for (const scale of [
              [Math.tan(FOV / 2) * aspect, Math.tan(FOV / 2)],
              [1 / projection[0], 1 / projection[5]],
            ]) {
              const corner = [
                ((u * 2) / GRID[0] - 1) * depth * scale[0],
                (1 - (v * 2) / GRID[1]) * depth * scale[1],
                -depth,
              ];
              corner.forEach((coordinate, axis) => {
                assert.ok(
                  coordinate >= bounds[cell * 8 + axis] &&
                    coordinate <= bounds[cell * 8 + 4 + axis],
                  `cell ${cell} axis ${axis} must enclose ${coordinate}`
                );
              });
            }
          }
    }
  }
});

test('observed near-tangent light383 uses one conservative packed bound definition', () => {
  const light = {
    position: [4.97828483581543, -0.8985952138900757, -22.39358139038086],
    radius: 3.747250556945801,
    color: [1, 1, 1],
  };
  const grid = clusterBounds(1);
  const cell = 1638;
  const squaredDistance = light.position.reduce(
    (sum, value, axis) =>
      sum +
      Math.max(
        grid[cell * 8 + axis] - value,
        0,
        value - grid[cell * 8 + 4 + axis]
      ) **
        2,
    0
  );
  assert.ok(squaredDistance <= light.radius ** 2);
  assert.deepEqual(clusterMembers([light], 1)[cell], [0]);
});

test('seeded lights are repeatable and bounded', () => {
  assert.deepEqual(seededLights(20), seededLights(20));
  const lights = seededLights(MAX_LIGHTS);
  assert.equal(lights.length, MAX_LIGHTS);
  assert.ok(
    lights.every(
      ({ radius, position }) =>
        radius >= 2 && radius <= 6 && position.every(Number.isFinite)
    )
  );
});
test('cluster oracle covers empty, disjoint, and overflowing spheres', () => {
  assert.equal(clusterMembers([], 1).length, CLUSTERS);
  assert.ok(clusterMembers([], 1).every((members) => members.length === 0));
  const light = { position: [0, 0, -10], radius: 1000, color: [1, 1, 1] };
  assert.ok(
    clusterMembers(Array(96).fill(light), 1).every(
      (members) => members.length === 96 && members[95] === 95
    )
  );
  assert.ok(
    clusterMembers(
      [{ ...light, position: [10000, 0, 0], radius: 1 }],
      1.5
    ).every((members) => members.length === 0)
  );
});
test('octahedral signed-zero boundaries and spherical coverage retain direction', () => {
  const normals = [
    [0, 0, -1],
    [-0, 0, -1],
    [1, 0, 0],
    [0, -1, 0],
  ];
  for (let i = 0; i < 4096; i++) {
    const z = 1 - (2 * (i + 0.5)) / 4096;
    const theta = i * 2.399963229728653;
    normals.push([
      Math.sqrt(1 - z * z) * Math.cos(theta),
      Math.sqrt(1 - z * z) * Math.sin(theta),
      z,
    ]);
  }
  for (const normal of normals) {
    const decoded = octRoundTrip(normal);
    const dot = decoded.reduce((sum, v, i) => sum + v * normal[i], 0);
    assert.ok((Math.acos(Math.min(1, dot)) * 180) / Math.PI < 0.01);
    assert.ok(Math.abs(Math.hypot(...decoded) - 1) < 1e-12);
  }
});
