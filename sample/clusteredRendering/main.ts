import { GUI } from 'dat.gui';
import { mat4, vec3 } from 'wgpu-matrix';
import shader from './render.wgsl';
import {
  CAPACITY,
  CLUSTERS,
  FAR,
  FOV,
  GRID,
  Light,
  MAX_LIGHTS,
  NEAR,
  seededLights,
  clusterBounds,
} from './math';
import { runVerification } from './verify';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const status = document.querySelector('#status') as HTMLOutputElement;
const settings = {
  mode: 'Clustered deferred',
  packed: true,
  lights: 256,
  freeze: true,
  orbit: 0,
  verify: () => verify(),
  export: () => exportEvidence(),
};
let running = true;
let verifying = false;
let evidence: unknown;
const fail = (error: unknown) => {
  running = false;
  status.value = `FAIL: ${String(error)}`;
  console.error(error);
};
window.addEventListener('error', (event) => fail(event.message));
window.addEventListener('unhandledrejection', (event) => fail(event.reason));

const adapter = await navigator.gpu?.requestAdapter();
if (!adapter)
  throw new Error(
    'WebGPU adapter unavailable; use a supported browser on localhost or HTTPS.'
  );
const device = await adapter.requestDevice();
device.lost.then((info) => fail(`Device lost: ${info.message}`));
device.addEventListener('uncapturederror', (event) =>
  fail(event.error.message)
);
const context = canvas.getContext('webgpu');
if (!context) throw new Error('WebGPU canvas unavailable');
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device, format });

const uniform = device.createBuffer({
  size: 240,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const lightBuffer = device.createBuffer({
  size: MAX_LIGHTS * 32,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
const clusterBuffer = device.createBuffer({
  size: CLUSTERS * (CAPACITY + 1) * 4,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
});
const boundsBuffer = device.createBuffer({
  size: CLUSTERS * 32,
  usage:
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
});
const readLayout = device.createBindGroupLayout({
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform' },
    },
    {
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT,
      buffer: { type: 'read-only-storage' },
    },
    {
      binding: 2,
      visibility: GPUShaderStage.FRAGMENT,
      buffer: { type: 'read-only-storage' },
    },
  ],
});
const texturesLayout = device.createBindGroupLayout({
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'unfilterable-float' },
    },
    {
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'unfilterable-float' },
    },
    {
      binding: 2,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'depth' },
    },
    {
      binding: 3,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'uint' },
    },
  ],
});
const module = device.createShaderModule({
  code:
    shader.slice(0, shader.indexOf('@compute')).replace('read_write', 'read') +
    shader.slice(shader.indexOf('struct VertexOutput')),
});
const computeModule = device.createShaderModule({ code: shader });
const compute = await device.createComputePipelineAsync({
  layout: 'auto',
  compute: { module: computeModule, entryPoint: 'cull' },
});
const commonEntries = [
  { binding: 0, resource: { buffer: uniform } },
  { binding: 1, resource: { buffer: lightBuffer } },
  { binding: 2, resource: { buffer: clusterBuffer } },
];
const common = device.createBindGroup({
  layout: readLayout,
  entries: commonEntries,
});
const computeGroup = device.createBindGroup({
  layout: compute.getBindGroupLayout(0),
  entries: [
    ...commonEntries,
    { binding: 3, resource: { buffer: boundsBuffer } },
  ],
});
const layout = device.createPipelineLayout({
  bindGroupLayouts: [readLayout, texturesLayout],
});
const geometryLayout = device.createPipelineLayout({
  bindGroupLayouts: [readLayout],
});
const vertex: GPUVertexState = {
  module,
  entryPoint: 'geometry',
  buffers: [
    {
      arrayStride: 36,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x3' },
      ],
    },
  ],
};
const pipeline = (
  entryPoint: string,
  targets: GPUColorTargetState[],
  geometry = true
) =>
  device.createRenderPipelineAsync({
    layout: geometry ? geometryLayout : layout,
    vertex: geometry ? vertex : { module, entryPoint: 'fullscreen' },
    fragment: { module, entryPoint, targets },
    primitive: { topology: 'triangle-list' },
    ...(geometry
      ? {
          depthStencil: {
            format: 'depth32float' as GPUTextureFormat,
            depthWriteEnabled: true,
            depthCompare: 'less' as GPUCompareFunction,
          },
        }
      : {}),
  });
const forward = await pipeline('forward', [{ format: 'rgba8unorm' }]);
const floating = await pipeline('gbufferFloat', [
  { format: 'rgba16float' },
  { format: 'rgba8unorm' },
]);
const packed = await pipeline('gbufferPacked', [{ format: 'rg32uint' }]);
const deferred = await pipeline('deferred', [{ format: 'rgba8unorm' }], false);
const presentModule = device.createShaderModule({
  code: `
  @group(0) @binding(0) var image: texture_2d<f32>;
  @vertex fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
    let p = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3)); return vec4f(p[i],0,1);
  }
  @fragment fn fragment(@builtin(position) p: vec4f) -> @location(0) vec4f { return textureLoad(image,vec2i(p.xy),0); }
`,
});
const present = await device.createRenderPipelineAsync({
  layout: 'auto',
  vertex: { module: presentModule, entryPoint: 'vertex' },
  fragment: {
    module: presentModule,
    entryPoint: 'fragment',
    targets: [{ format }],
  },
});

// Procedural boxes contain no third-party model or texture data.
const vertices: number[] = [];
function box(center: number[], size: number[], color: number[]) {
  for (let axis = 0; axis < 3; axis++)
    for (const direction of [-1, 1]) {
      const u = (axis + 1) % 3;
      const v = (axis + 2) % 3;
      const normal = [0, 0, 0];
      normal[axis] = direction;
      for (const [a, b] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const position = center.slice();
        position[axis] += (size[axis] * direction) / 2;
        position[u] += (size[u] * a) / 2;
        position[v] += (size[v] * b) / 2;
        vertices.push(...position, ...normal, ...color);
      }
    }
}
box([0, -0.3, 0], [24, 0.6, 24], [0.55, 0.55, 0.55]);
box([0, 5, -11], [24, 10, 0.5], [0.6, 0.6, 0.6]);
for (let z = -2; z <= 2; z++)
  for (let x = -2; x <= 2; x++) {
    const height = 1.3 + ((x * x + z * z) % 4) * 0.8;
    box(
      [x * 3.6, height / 2, z * 3.6],
      [1.8, height, 1.8],
      [0.32 + (x + 2) * 0.08, 0.35, 0.32 + (z + 2) * 0.08]
    );
  }
const vertexBuffer = device.createBuffer({
  size: vertices.length * 4,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(vertexBuffer, 0, new Float32Array(vertices));

let width = 0,
  height = 0,
  activePacked = false;
let textures: GPUTexture[] = [];
let textureGroup: GPUBindGroup;
let presentGroup: GPUBindGroup;
let currentLights: Light[] = [];
let currentAspect = 1;
const cameraData = new ArrayBuffer(240);
const floats = new Float32Array(cameraData);
const integers = new Uint32Array(cameraData);
function resources(usePacked: boolean) {
  const wantedWidth = Math.min(
    1200,
    Math.max(1, Math.round(canvas.clientWidth * window.devicePixelRatio))
  );
  const wantedHeight = Math.min(
    1200,
    Math.max(1, Math.round(canvas.clientHeight * window.devicePixelRatio))
  );
  if (
    width === wantedWidth &&
    height === wantedHeight &&
    activePacked === usePacked
  )
    return;
  if (width !== wantedWidth || height !== wantedHeight) {
    device.queue.writeBuffer(
      boundsBuffer,
      0,
      clusterBounds(wantedWidth / wantedHeight)
    );
  }
  width = canvas.width = wantedWidth;
  height = canvas.height = wantedHeight;
  activePacked = usePacked;
  textures.forEach((texture) => texture.destroy());
  const texture = (textureFormat: GPUTextureFormat, full = true) =>
    device.createTexture({
      size: full ? [width, height] : [1, 1],
      format: textureFormat,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });
  textures = [
    texture('rgba16float', !usePacked),
    texture('rgba8unorm', !usePacked),
    texture('depth32float'),
    texture('rg32uint', usePacked),
    texture('rgba8unorm'),
  ];
  textureGroup = device.createBindGroup({
    layout: texturesLayout,
    entries: textures
      .slice(0, 4)
      .map((t, binding) => ({ binding, resource: t.createView() })),
  });
  presentGroup = device.createBindGroup({
    layout: present.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: textures[4].createView() }],
  });
}

function update(
  lights: Light[],
  orbit: number,
  mode: number,
  usePacked: boolean,
  viewSpace = false
) {
  resources(usePacked);
  currentAspect = width / height;
  const projection = mat4.perspective(FOV, currentAspect, NEAR, FAR);
  const eye = [Math.sin(orbit) * 22, 14, Math.cos(orbit) * 22];
  const view = mat4.lookAt(eye, [0, 2, 0], [0, 1, 0]);
  floats.set(projection, 0);
  floats.set(mat4.inverse(projection), 16);
  floats.set(view, 32);
  floats.set([width, height, NEAR, FAR], 48);
  integers.set([...GRID, lights.length], 52);
  integers.set([mode, usePacked ? 1 : 0, CAPACITY, 0], 56);
  device.queue.writeBuffer(uniform, 0, cameraData);
  currentLights = lights.map((light) => ({
    ...light,
    position: viewSpace
      ? light.position
      : Array.from(vec3.transformMat4(light.position, view)),
  }));
  const data = new Float32Array(MAX_LIGHTS * 8);
  currentLights.forEach((light, i) =>
    data.set([...light.position, light.radius, ...light.color, 1], i * 8)
  );
  // The oracle consumes the same f32 light inputs uploaded to the GPU, without reusing the GPU culling implementation.
  currentLights = currentLights.map((light, i) => ({
    ...light,
    position: Array.from(data.slice(i * 8, i * 8 + 3)),
    radius: data[i * 8 + 3],
  }));
  device.queue.writeBuffer(lightBuffer, 0, data);
}

function render(mode: number, usePacked: boolean, show = true) {
  const encoder = device.createCommandEncoder();
  if (mode !== 0) {
    const pass = encoder.beginComputePass();
    pass.setPipeline(compute);
    pass.setBindGroup(0, computeGroup);
    pass.dispatchWorkgroups(Math.ceil(CLUSTERS / 64));
    pass.end();
  }
  const clear = { r: 0.025, g: 0.025, b: 0.025, a: 1 };
  const attachment = (texture: GPUTexture): GPURenderPassColorAttachment => ({
    view: texture.createView(),
    clearValue: clear,
    loadOp: 'clear',
    storeOp: 'store',
  });
  const geometryPass = encoder.beginRenderPass({
    colorAttachments:
      mode === 2
        ? usePacked
          ? [{ ...attachment(textures[3]), clearValue: [0, 0, 0, 0] }]
          : [attachment(textures[0]), attachment(textures[1])]
        : [attachment(textures[4])],
    depthStencilAttachment: {
      view: textures[2].createView(),
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  });
  geometryPass.setPipeline(
    mode === 2 ? (usePacked ? packed : floating) : forward
  );
  geometryPass.setBindGroup(0, common);
  geometryPass.setVertexBuffer(0, vertexBuffer);
  geometryPass.draw(vertices.length / 9);
  geometryPass.end();
  if (mode === 2) {
    const pass = encoder.beginRenderPass({
      colorAttachments: [attachment(textures[4])],
    });
    pass.setPipeline(deferred);
    pass.setBindGroup(0, common);
    pass.setBindGroup(1, textureGroup);
    pass.draw(3);
    pass.end();
  }
  if (show) {
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(present);
    pass.setBindGroup(0, presentGroup);
    pass.draw(3);
    pass.end();
  }
  device.queue.submit([encoder.finish()]);
}

async function readBuffer(source: GPUBuffer, size: number) {
  const buffer = device.createBuffer({
    size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  try {
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(source, 0, buffer, 0, size);
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    return buffer.getMappedRange().slice(0);
  } finally {
    buffer.destroy();
  }
}
async function readImage() {
  const stride = Math.ceil((width * 4) / 256) * 256;
  const buffer = device.createBuffer({
    size: stride * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  try {
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer(
      { texture: textures[4] },
      { buffer, bytesPerRow: stride },
      [width, height]
    );
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const raw = new Uint8Array(buffer.getMappedRange());
    const image = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++)
      image.set(
        raw.subarray(y * stride, y * stride + width * 4),
        y * width * 4
      );
    return image;
  } finally {
    buffer.destroy();
  }
}
async function octErrors() {
  const normals = [
    [0, 0, -1],
    [0, 0, 1],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
  ];
  for (let i = 0; i < 4096; i++) {
    const z = 1 - (2 * (i + 0.5)) / 4096;
    const angle = i * 2.399963229728653;
    normals.push([
      Math.sqrt(1 - z * z) * Math.cos(angle),
      Math.sqrt(1 - z * z) * Math.sin(angle),
      z,
    ]);
  }
  const input = device.createBuffer({
    size: normals.length * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const output = device.createBuffer({
    size: normals.length * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  try {
    device.queue.writeBuffer(
      input,
      0,
      new Float32Array(normals.flatMap((n) => [...n, 0]))
    );
    const oct = shader.slice(
      shader.indexOf('fn signNotZero'),
      shader.indexOf('struct FloatGBuffer')
    );
    const module = device.createShaderModule({
      code: `${oct}\n@group(0) @binding(0) var<storage,read> source: array<vec4f>; @group(0) @binding(1) var<storage,read_write> result: array<vec4f>; @compute @workgroup_size(64) fn test(@builtin(global_invocation_id) id: vec3u) { if(id.x < arrayLength(&source)) { result[id.x] = vec4f(decodeOct(encodeOct(normalize(source[id.x].xyz))), 0); } }`,
    });
    const pipeline = await device.createComputePipelineAsync({
      layout: 'auto',
      compute: { module, entryPoint: 'test' },
    });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: input } },
        { binding: 1, resource: { buffer: output } },
      ],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(Math.ceil(normals.length / 64));
    pass.end();
    device.queue.submit([encoder.finish()]);
    const result = new Float32Array(
      await readBuffer(output, normals.length * 16)
    );
    let maximum = 0;
    normals.forEach((normal, i) => {
      const decoded = Array.from(result.slice(i * 4, i * 4 + 3));
      const cross = vec3.cross(normal, decoded);
      const dot = vec3.dot(normal, decoded);
      maximum = Math.max(
        maximum,
        (Math.atan2(vec3.length(cross), dot) * 180) / Math.PI
      );
    });
    return {
      samples: normals.length,
      maxDegrees: maximum,
      toleranceDegrees: 0.01,
      pass: maximum <= 0.01,
    };
  } finally {
    input.destroy();
    output.destroy();
  }
}

async function verify() {
  if (verifying || !running) return;
  verifying = true;
  status.value = 'Verifying GPU…';
  device.pushErrorScope('validation');
  let failure: unknown;
  try {
    evidence = await runVerification({
      update,
      render,
      readImage,
      octErrors,
      readClusters: async () =>
        new Uint32Array(await readBuffer(clusterBuffer, clusterBuffer.size)),
      readBounds: async () =>
        new Float32Array(await readBuffer(boundsBuffer, boundsBuffer.size)),
      lights: () => currentLights,
      dimensions: () => ({ width, height, aspect: currentAspect }),
      adapter: {
        vendor: adapter.info.vendor,
        architecture: adapter.info.architecture,
        device: adapter.info.device,
        description: adapter.info.description,
      },
    });
  } catch (error) {
    failure = error;
  } finally {
    const validationError = await device.popErrorScope();
    failure =
      failure ||
      validationError ||
      (!running && 'Device stopped during verification');
    if (failure) evidence = { pass: false, error: String(failure) };
    status.value = failure
      ? `FAIL: ${String(failure)}`
      : (evidence as { pass: boolean }).pass
      ? 'PASS — export evidence'
      : 'FAIL — export evidence';
    verifying = false;
  }
}
function exportEvidence() {
  if (!evidence) {
    status.value = 'Run Verify GPU first';
    return;
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' })
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'clustered-renderer-evidence.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const gui = new GUI();
gui
  .add(settings, 'mode', [
    'Naive forward',
    'Clustered forward',
    'Clustered deferred',
  ])
  .name('Render mode');
gui.add(settings, 'packed').name('Packed normals');
gui.add(settings, 'lights', 0, MAX_LIGHTS, 1).name('Lights');
gui.add(settings, 'freeze').name('Freeze lights');
gui.add(settings, 'orbit', -Math.PI, Math.PI, 0.01).name('Camera orbit');
gui.add(settings, 'verify').name('Verify GPU');
gui.add(settings, 'export').name('Export evidence');
status.value = 'Ready';
function frame(time: number) {
  if (!running) return;
  if (!verifying) {
    const mode = [
      'Naive forward',
      'Clustered forward',
      'Clustered deferred',
    ].indexOf(settings.mode);
    update(
      seededLights(settings.lights, settings.freeze ? 0 : time / 1000),
      settings.orbit,
      mode,
      settings.packed
    );
    render(mode, settings.packed);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
