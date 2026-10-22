export const GRID = [12, 12, 16] as const;
export const CAPACITY = 64;
export const CLUSTERS = GRID[0] * GRID[1] * GRID[2];
export const MAX_LIGHTS = 1024;
export const NEAR = 0.5;
export const FAR = 80;
export const FOV = Math.PI / 3;
export type Light = { position: number[]; radius: number; color: number[] };

export function seededLights(count: number, time = 0): Light[] {
  let seed = 565;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, (_, i) => ({
    position: [
      (random() - 0.5) * 18 + Math.sin(time + i) * 0.4,
      random() * 7 + 0.3,
      (random() - 0.5) * 18,
    ],
    radius: 2 + random() * 4,
    color: [random(), random(), random()].map((v) => 0.15 + v * 0.5),
  }));
}

// Canonical grid input: outward-rounded f32 bounds enclose all eight exact frustum corners.
export function clusterBounds(aspect: number): Float32Array<ArrayBuffer> {
  const packed = new Float32Array(CLUSTERS * 8);
  for (let index = 0; index < CLUSTERS; index++) {
    const x = index % GRID[0];
    const y = Math.floor(index / GRID[0]) % GRID[1];
    const z = Math.floor(index / (GRID[0] * GRID[1]));
    const corners: number[][] = [];
    for (const depth of [
      NEAR * (FAR / NEAR) ** (z / GRID[2]),
      NEAR * (FAR / NEAR) ** ((z + 1) / GRID[2]),
    ]) {
      for (const u of [x, x + 1]) {
        for (const v of [y, y + 1]) {
          corners.push([
            ((2 * u) / GRID[0] - 1) * depth * Math.tan(FOV / 2) * aspect,
            (1 - (2 * v) / GRID[1]) * depth * Math.tan(FOV / 2),
            -depth,
          ]);
        }
      }
    }
    const low = [0, 1, 2].map((axis) =>
      Math.min(...corners.map((p) => p[axis]))
    );
    const high = [0, 1, 2].map((axis) =>
      Math.max(...corners.map((p) => p[axis]))
    );
    const outward = (v: number, direction: number) =>
      Math.fround(v + direction * (Math.abs(v) * 2 ** -22 + 1e-6));
    packed.set(
      [
        ...low.map((v) => outward(v, -1)),
        0,
        ...high.map((v) => outward(v, 1)),
        0,
      ],
      index * 8
    );
  }
  return packed;
}

// Independent CPU predicate over the same explicitly packed grid/light inputs used by compute.
export function clusterMembers(lights: Light[], aspect: number): number[][] {
  const bounds = clusterBounds(aspect);
  return Array.from({ length: CLUSTERS }, (_, index) => {
    const low = bounds.subarray(index * 8, index * 8 + 3);
    const high = bounds.subarray(index * 8 + 4, index * 8 + 7);
    return lights.flatMap((light, i) => {
      const distance = light.position.reduce((sum, value, axis) => {
        const d = Math.max(low[axis] - value, 0, value - high[axis]);
        return sum + d * d;
      }, 0);
      return distance <= light.radius ** 2 ? [i] : [];
    });
  });
}

export function octRoundTrip(normal: number[]): number[] {
  const sign = (v: number) => (v < 0 ? -1 : 1);
  const divisor = normal.reduce((sum, v) => sum + Math.abs(v), 0);
  let x = normal[0] / divisor;
  let y = normal[1] / divisor;
  if (normal[2] < 0)
    [x, y] = [(1 - Math.abs(y)) * sign(x), (1 - Math.abs(x)) * sign(y)];
  x = Math.round(x * 32767) / 32767;
  y = Math.round(y * 32767) / 32767;
  const z = 1 - Math.abs(x) - Math.abs(y);
  if (z < 0)
    [x, y] = [(1 - Math.abs(y)) * sign(x), (1 - Math.abs(x)) * sign(y)];
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}
