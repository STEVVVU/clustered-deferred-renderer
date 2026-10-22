import { seededLights, Light } from './math';
import { imageError } from './verify';

export const BENCHMARK_CASES = [
  { width: 640, height: 360, grid: 5, lights: 64 },
  { width: 640, height: 360, grid: 5, lights: 256 },
  { width: 640, height: 360, grid: 5, lights: 1024 },
  { width: 1280, height: 720, grid: 5, lights: 256 },
  { width: 1280, height: 720, grid: 25, lights: 256 },
  { width: 1280, height: 720, grid: 25, lights: 1024 },
] as const;
const SIDES = [
  { name: 'naive', mode: 0, packed: false },
  { name: 'clustered-forward', mode: 1, packed: false },
  { name: 'deferred-float', mode: 2, packed: false },
  { name: 'deferred-packed', mode: 2, packed: true },
] as const;

interface Driver {
  configure(width: number, height: number, grid: number): void;
  update(lights: Light[], orbit: number, mode: number, packed: boolean): void;
  render(mode: number, packed: boolean, show?: boolean): void;
  readImage(): Promise<Uint8Array>;
  measure(
    mode: number,
    packed: boolean
  ): Promise<{
    wallMs: number;
    gpuMs: number | null;
    stagesMs: Record<string, number> | null;
  }>;
  bytes(packed: boolean): object;
  adapter: object;
}

export function distribution(values: number[]) {
  if (!values.length || values.some((v) => !Number.isFinite(v) || v <= 0))
    throw new Error('Timing samples must be finite and positive');
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: values,
    p50: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    range: [sorted[0], sorted[sorted.length - 1]],
  };
}

export async function runBenchmark(driver: Driver) {
  const results = [];
  for (const workload of BENCHMARK_CASES) {
    driver.configure(workload.width, workload.height, workload.grid);
    const lights = seededLights(workload.lights, 0);
    const images: Uint8Array[] = [];
    const samples = SIDES.map(() => ({
      wall: [] as number[],
      gpu: [] as number[],
      repeats: [] as object[],
      diagnostic: null as Record<string, number> | null,
    }));
    for (const side of SIDES) {
      driver.update(lights, 0, side.mode, side.packed);
      for (let warm = 0; warm < 10; warm++)
        await driver.measure(side.mode, side.packed);
      driver.render(side.mode, side.packed, false);
      images.push(await driver.readImage());
    }
    const correctness = [
      imageError(images[0], images[1], 1),
      imageError(images[0], images[2], 3),
      imageError(images[2], images[3], 2),
    ];
    const litChannels = images[0].filter(
      (value, index) => index % 4 !== 3 && value > 32
    ).length;
    if (litChannels < 1000 || correctness.some((check) => !check.pass))
      return {
        pass: false,
        failedWorkload: workload,
        correctness,
        litChannels,
        completed: results,
      };
    for (let repeat = 0; repeat < 7; repeat++) {
      for (let position = 0; position < SIDES.length; position++) {
        const index = (repeat + position) % SIDES.length;
        const side = SIDES[index];
        driver.update(lights, 0, side.mode, side.packed);
        const wall: number[] = [],
          gpu: number[] = [];
        for (let frame = 0; frame < 20; frame++) {
          const value = await driver.measure(side.mode, side.packed);
          wall.push(value.wallMs);
          if (value.gpuMs !== null) gpu.push(value.gpuMs);
          samples[index].diagnostic = value.stagesMs;
        }
        const checked = imageError(images[index], await driver.readImage(), 0);
        if (!checked.pass)
          return {
            pass: false,
            failedWorkload: workload,
            side,
            repeat,
            wall,
            gpu,
            correctness: checked,
            completed: results,
          };
        samples[index].wall.push(...wall);
        samples[index].gpu.push(...gpu);
        samples[index].repeats.push({
          repeat,
          wall: distribution(wall),
          gpu: gpu.length ? distribution(gpu) : null,
          offered: 20,
          finished: 20,
          failed: 0,
          correctness: checked,
        });
      }
    }
    results.push({
      workload,
      triangles: (workload.grid ** 2 + 2) * 12,
      correctness,
      sides: SIDES.map((side, index) => ({
        ...side,
        wallFrameMs: distribution(samples[index].wall),
        gpuFrameMs: samples[index].gpu.length
          ? distribution(samples[index].gpu)
          : null,
        repeats: samples[index].repeats,
        finalDiagnosticStagesMs: samples[index].diagnostic,
        logicalAllocation: driver.bytes(side.packed),
      })),
    });
  }
  return {
    workloadVersion: 1,
    seed: 565,
    adapter: driver.adapter,
    userAgent: navigator.userAgent,
    timingScope:
      'Submitted production render with presentation and queue completion; no RAF/vsync. GPU timestamp span only when supported; includes compute, geometry, deferred shading and presentation. Allocation, compilation, warmup and image checks excluded.',
    warmupFramesPerSide: 10,
    repeatsPerSide: 7,
    framesPerRepeat: 20,
    results,
    pass: true,
  };
}
