import {
  CAPACITY,
  CLUSTERS,
  FAR,
  Light,
  MAX_LIGHTS,
  NEAR,
  clusterMembers,
  seededLights,
} from './math';

interface Driver {
  update(
    lights: Light[],
    orbit: number,
    mode: number,
    packed: boolean,
    viewSpace?: boolean
  ): void;
  render(mode: number, packed: boolean, show?: boolean): void;
  readImage(): Promise<Uint8Array>;
  readClusters(): Promise<Uint32Array>;
  readBounds(): Promise<Float32Array>;
  octErrors(): Promise<{
    samples: number;
    maxDegrees: number;
    toleranceDegrees: number;
    pass: boolean;
  }>;
  lights(): Light[];
  dimensions(): { width: number; height: number; aspect: number };
  adapter: object;
}
function imageError(
  reference: Uint8Array,
  actual: Uint8Array,
  tolerance: number
) {
  if (reference.length !== actual.length || actual.length === 0) {
    return {
      maxChannelError: 255,
      meanChannelError: 255,
      channelsAboveTolerance: Math.max(reference.length, actual.length),
      tolerance,
      pass: false,
    };
  }
  let maximum = 0,
    sum = 0,
    changed = 0;
  for (let i = 0; i < actual.length; i++) {
    if (i % 4 === 3) continue;
    const error = Math.abs(reference[i] - actual[i]);
    maximum = Math.max(maximum, error);
    sum += error;
    if (error > tolerance) changed++;
  }
  return {
    maxChannelError: maximum,
    meanChannelError: sum / (actual.length * 0.75),
    channelsAboveTolerance: changed,
    tolerance,
    pass: changed === 0,
  };
}

export async function runVerification(driver: Driver) {
  const boundary: Light[] = [NEAR, NEAR * (FAR / NEAR) ** 0.5, FAR].flatMap(
    (depth) =>
      [-0.02, 0, 0.02].map((offset) => ({
        position: [0, 0, -depth + offset],
        radius: 0.2,
        color: [0.5, 0.3, 0.2],
      }))
  );
  const cases = [
    { name: 'zero', lights: [], orbit: 0, viewSpace: false },
    { name: 'seeded', lights: seededLights(256), orbit: 0, viewSpace: false },
    {
      name: 'camera-orbit',
      lights: seededLights(256),
      orbit: 1.1,
      viewSpace: false,
    },
    {
      name: 'maximum',
      lights: seededLights(MAX_LIGHTS),
      orbit: 0,
      viewSpace: false,
    },
    {
      name: 'dense-overflow',
      lights: seededLights(96).map((light) => ({
        ...light,
        position: [0, 3, 0],
        radius: 60,
      })),
      orbit: 0,
      viewSpace: false,
    },
    { name: 'depth-boundaries', lights: boundary, orbit: 0, viewSpace: true },
  ];
  const results = [];
  for (const scenario of cases) {
    driver.update(
      scenario.lights,
      scenario.orbit,
      1,
      false,
      scenario.viewSpace
    );
    driver.render(1, false, false);
    const actual = await driver.readClusters();
    const bounds = await driver.readBounds();
    const expected = clusterMembers(
      driver.lights(),
      driver.dimensions().aspect
    );
    let mismatches = 0,
      overflowClusters = 0,
      references = 0;
    const diagnostics = [];
    for (let i = 0; i < CLUSTERS; i++) {
      const offset = i * (CAPACITY + 1);
      if (actual[offset] !== expected[i].length) mismatches++;
      if (actual[offset] > CAPACITY) overflowClusters++;
      references += actual[offset];
      for (let j = 0; j < Math.min(CAPACITY, expected[i].length); j++)
        if (actual[offset + 1 + j] !== expected[i][j]) mismatches++;
      const gpuIDs = Array.from(
        actual.slice(
          offset + 1,
          offset + 1 + Math.min(actual[offset], CAPACITY)
        )
      );
      if (
        diagnostics.length < 8 &&
        (actual[offset] !== expected[i].length ||
          gpuIDs.some((id, j) => id !== expected[i][j]))
      ) {
        const low = Array.from(bounds.slice(i * 8, i * 8 + 3));
        const high = Array.from(bounds.slice(i * 8 + 4, i * 8 + 7));
        const margins = driver.lights().map((light, id) => {
          const distanceSquared = light.position.reduce(
            (sum, value, axis) =>
              sum + Math.max(low[axis] - value, 0, value - high[axis]) ** 2,
            0
          );
          return {
            id,
            positionF32: light.position,
            radiusF32: light.radius,
            distanceSquared,
            radiusSquared: light.radius ** 2,
            margin: distanceSquared - light.radius ** 2,
          };
        });
        diagnostics.push({
          cluster: i,
          gpuCount: actual[offset],
          cpuCount: expected[i].length,
          gpuIDs,
          cpuIDs: expected[i].slice(0, CAPACITY),
          gpuBounds: { low, high },
          cpuCountUsingGPUBounds: margins.filter((m) => m.margin <= 0).length,
          nearestBoundaryLights: margins
            .sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin))
            .slice(0, 5),
        });
      }
    }
    const images: Uint8Array[] = [];
    for (const [mode, packed] of [
      [0, false],
      [1, false],
      [2, false],
      [2, true],
    ] as const) {
      driver.update(
        scenario.lights,
        scenario.orbit,
        mode,
        packed,
        scenario.viewSpace
      );
      driver.render(mode, packed, false);
      images.push(await driver.readImage());
    }
    const forward = imageError(images[0], images[1], 1);
    const deferred = imageError(images[0], images[2], 3);
    const packed = imageError(images[2], images[3], 2);
    driver.update([], scenario.orbit, 0, false, scenario.viewSpace);
    driver.render(0, false, false);
    const zeroLightImage = await driver.readImage();
    const delta = imageError(zeroLightImage, images[0], 1);
    const requireLighting = [
      'seeded',
      'maximum',
      'dense-overflow',
      'camera-orbit',
    ].includes(scenario.name);
    const lightingResponse = {
      ...delta,
      required: requireLighting,
      pass:
        !requireLighting ||
        (delta.channelsAboveTolerance > 1000 && delta.meanChannelError > 1),
    };
    const nonBackgroundPixels = images[0].filter(
      (value, i) => i % 4 === 0 && value !== 6
    ).length;
    results.push({
      name: scenario.name,
      lightCount: scenario.lights.length,
      clusters: {
        mismatches,
        overflowClusters,
        references,
        diagnostics,
        pass:
          mismatches === 0 &&
          (scenario.name !== 'dense-overflow' || overflowClusters > 0),
      },
      forward,
      deferred,
      packed,
      lightingResponse,
      nonBackgroundPixels,
      pass:
        mismatches === 0 &&
        forward.pass &&
        deferred.pass &&
        packed.pass &&
        lightingResponse.pass &&
        nonBackgroundPixels > 0 &&
        (scenario.name !== 'dense-overflow' || overflowClusters > 0),
    });
  }
  const normals = await driver.octErrors();
  const { width, height } = driver.dimensions();
  const pixels = width * height;
  return {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    adapter: driver.adapter,
    dimensions: { width, height },
    pass: results.every((result) => result.pass) && normals.pass,
    cases: results,
    normals,
    allocation: {
      meaning:
        'Created texture logical texel payload, not opaque physical driver allocation. Includes inactive 1x1 binding placeholders; shared depth32float/output excluded from comparison.',
      floatGBufferBytes: pixels * 12 + 8,
      packedGBufferBytes: pixels * 8 + 12,
      savedBytes: pixels * 4 - 4,
      sharedDepthAndOutputBytes: pixels * 8,
      clusterBufferBytes: CLUSTERS * (CAPACITY + 1) * 4,
      canonicalGridBufferBytes: CLUSTERS * 32,
    },
    performance:
      'No GPU timestamp measurements or speedup claim. Readbacks synchronize GPU execution for correctness only.',
  };
}
