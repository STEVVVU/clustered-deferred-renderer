struct Camera {
  projection: mat4x4f,
  inverseProjection: mat4x4f,
  view: mat4x4f,
  screen: vec4f,
  grid: vec4u,
  settings: vec4u,
}
struct Light { sphere: vec4f, color: vec4f }
struct Cluster { count: u32, indices: array<u32, 64> }
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> lights: array<Light>;
@group(0) @binding(2) var<storage, read_write> clusters: array<Cluster>;
@group(0) @binding(3) var<storage, read> bounds: array<vec4f>;

@compute @workgroup_size(64)
fn cull(@builtin(global_invocation_id) invocation: vec3u) {
  let id = invocation.x;
  if (id >= camera.grid.x * camera.grid.y * camera.grid.z) { return; }
  let low = bounds[id * 2u].xyz;
  let high = bounds[id * 2u + 1u].xyz;
  var count = 0u;
  for (var i = 0u; i < camera.grid.w; i++) {
    let sphere = lights[i].sphere;
    let delta = max(max(low - sphere.xyz, sphere.xyz - high), vec3f(0));
    if (dot(delta, delta) <= sphere.w * sphere.w) {
      if (count < 64u) { clusters[id].indices[count] = i; }
      count++;
    }
  }
  clusters[id].count = count;
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) viewPosition: vec3f,
  @location(1) normal: vec3f,
  @location(2) albedo: vec3f,
}
@vertex fn geometry(@location(0) position: vec3f, @location(1) normal: vec3f, @location(2) albedo: vec3f) -> VertexOutput {
  var output: VertexOutput;
  let view = camera.view * vec4f(position, 1);
  output.position = camera.projection * view;
  output.viewPosition = view.xyz;
  output.normal = (camera.view * vec4f(normal, 0)).xyz;
  output.albedo = albedo;
  return output;
}
fn clusterIndex(pixel: vec2f, depth: f32) -> u32 {
  let xy = min(vec2u(pixel / camera.screen.xy * vec2f(camera.grid.xy)), camera.grid.xy - 1u);
  let z = u32(clamp(floor(log(max(depth, camera.screen.z) / camera.screen.z) / log(camera.screen.w / camera.screen.z) * f32(camera.grid.z)), 0.0, f32(camera.grid.z - 1u)));
  return xy.x + camera.grid.x * (xy.y + camera.grid.y * z);
}
fn contribution(index: u32, position: vec3f, normal: vec3f) -> vec3f {
  let light = lights[index];
  let delta = light.sphere.xyz - position;
  let distance = length(delta);
  let attenuation = max(1.0 - distance / light.sphere.w, 0.0);
  return light.color.xyz * max(dot(normal, delta / max(distance, 0.00001)), 0.0) * attenuation * attenuation;
}
fn lighting(position: vec3f, normal: vec3f, albedo: vec3f, pixel: vec2f) -> vec4f {
  let id = clusterIndex(pixel, -position.z);
  let count = clusters[id].count;
  var illumination = vec3f(0.045);
  // Overflow preserves every light by using the naive loop for this cluster.
  if (camera.settings.x == 0u || count > 64u) {
    for (var i = 0u; i < camera.grid.w; i++) { illumination += contribution(i, position, normal); }
  } else {
    for (var i = 0u; i < count; i++) { illumination += contribution(clusters[id].indices[i], position, normal); }
  }
  let color = albedo * illumination;
  return vec4f(pow(color / (vec3f(1) + color), vec3f(1.0 / 2.2)), 1);
}
@fragment fn forward(input: VertexOutput) -> @location(0) vec4f {
  return lighting(input.viewPosition, normalize(input.normal), input.albedo, input.position.xy);
}
fn signNotZero(v: vec2f) -> vec2f { return select(vec2f(1), vec2f(-1), v < vec2f(0)); }
fn encodeOct(normal: vec3f) -> u32 {
  let n = normal / (abs(normal.x) + abs(normal.y) + abs(normal.z));
  var p = n.xy;
  if (n.z < 0) { p = (vec2f(1) - abs(p.yx)) * signNotZero(p); }
  return pack2x16snorm(p);
}
fn decodeOct(packed: u32) -> vec3f {
  let p = unpack2x16snorm(packed);
  var n = vec3f(p, 1.0 - abs(p.x) - abs(p.y));
  if (n.z < 0) { n = vec3f((vec2f(1) - abs(n.yx)) * signNotZero(n.xy), n.z); }
  return normalize(n);
}
struct FloatGBuffer { @location(0) normal: vec4f, @location(1) albedo: vec4f }
@fragment fn gbufferFloat(input: VertexOutput) -> FloatGBuffer {
  var output: FloatGBuffer;
  output.normal = vec4f(normalize(input.normal), 1);
  output.albedo = vec4f(input.albedo, 1);
  return output;
}
@fragment fn gbufferPacked(input: VertexOutput) -> @location(0) vec2u {
  return vec2u(encodeOct(normalize(input.normal)), pack4x8unorm(vec4f(input.albedo, 1)));
}
@vertex fn fullscreen(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let positions = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  return vec4f(positions[index], 0, 1);
}
@group(1) @binding(0) var normals: texture_2d<f32>;
@group(1) @binding(1) var albedos: texture_2d<f32>;
@group(1) @binding(2) var depths: texture_depth_2d;
@group(1) @binding(3) var packedGBuffer: texture_2d<u32>;
@fragment fn deferred(@builtin(position) pixel: vec4f) -> @location(0) vec4f {
  let coordinate = vec2i(pixel.xy);
  let depth = textureLoad(depths, coordinate, 0);
  if (depth >= 1.0) { return vec4f(0.025, 0.025, 0.025, 1); }
  let ndc = vec4f(pixel.x / camera.screen.x * 2.0 - 1.0, 1.0 - pixel.y / camera.screen.y * 2.0, depth, 1);
  let homogeneous = camera.inverseProjection * ndc;
  let position = homogeneous.xyz / homogeneous.w;
  var normal: vec3f;
  var albedo: vec3f;
  if (camera.settings.y == 1u) {
    let packed = textureLoad(packedGBuffer, coordinate, 0).xy;
    normal = decodeOct(packed.x);
    albedo = unpack4x8unorm(packed.y).xyz;
  } else {
    normal = normalize(textureLoad(normals, coordinate, 0).xyz);
    albedo = textureLoad(albedos, coordinate, 0).xyz;
  }
  return lighting(position, normal, albedo, pixel.xy);
}
