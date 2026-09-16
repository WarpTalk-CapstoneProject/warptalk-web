/**
 * Draws voice orbs (see ./voice-orb for the formula) and hands them out as pictures.
 *
 * ONE GPU CONTEXT FOR THE WHOLE PAGE. The library lists several hundred voices at once, and a
 * browser allows a page roughly sixteen live WebGL contexts before it starts killing the oldest.
 * So no row owns a canvas: a single hidden canvas draws each orb once, the frame is read back as
 * a small JPEG, and rows show that as a background image. The orb does not move, so nothing is
 * lost by freezing it.
 *
 * DRAWN ON DEMAND, A FEW PER FRAME. Rows ask only when they scroll into view (VoiceOrb), and the
 * queue drains six per animation frame, so opening a list of four hundred never blocks the page.
 * A request withdrawn before its turn — the row scrolled away or unmounted — is dropped.
 *
 * DRAWN AT DEVICE RESOLUTION. The grain is one speck per pixel; drawn large and scaled down it
 * would average away to nothing, which is exactly the flat look this replaced.
 *
 * Where WebGL2 is missing or the context is lost for good, nothing is drawn and the orb keeps its
 * CSS stand-in (orbFallbackBackground) — same palette, no grain.
 */

import { voiceOrbParams, type VoiceOrbParams } from "./voice-orb";

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

/*
 * The sphere is lit geometry; the colour on it is gradient noise sampled on the sphere's surface
 * (so regions compress toward the rim, as they would on a real ball) and domain-warped twice, which
 * is what smears the regions into one another. Then Lambert light from below, a lit rim on that
 * side, a darkened rim opposite, and two layers of noise on top: per-pixel grain and a softer
 * mottle a few pixels across.
 *
 * hash12 and hash33 are Dave Hoskins' "Hash without Sine" (MIT licence).
 */
const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec3 uDark;
uniform vec3 uMid;
uniform vec3 uLight;
uniform vec3 uAccent;
uniform vec3 uOffset;
uniform mat3 uRotation;
uniform float uScale;
uniform float uWarp;
uniform float uBias;
uniform vec2 uLightDirection;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx) * 2.0 - 1.0;
}
float gradientNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(mix(dot(hash33(i), f), dot(hash33(i + vec3(1, 0, 0)), f - vec3(1, 0, 0)), u.x),
        mix(dot(hash33(i + vec3(0, 1, 0)), f - vec3(0, 1, 0)), dot(hash33(i + vec3(1, 1, 0)), f - vec3(1, 1, 0)), u.x), u.y),
    mix(mix(dot(hash33(i + vec3(0, 0, 1)), f - vec3(0, 0, 1)), dot(hash33(i + vec3(1, 0, 1)), f - vec3(1, 0, 1)), u.x),
        mix(dot(hash33(i + vec3(0, 1, 1)), f - vec3(0, 1, 1)), dot(hash33(i + vec3(1, 1, 1)), f - vec3(1, 1, 1)), u.x), u.y),
    u.z);
}
// Two octaves only: the reference orbs are soft, and every further octave adds marbling.
float fbm(vec3 p) {
  return 0.62 * gradientNoise(p) + 0.186 * gradientNoise(p * 1.9 + vec3(1.7, 9.2, 3.4));
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float z = sqrt(max(0.0, 1.0 - dot(uv, uv)));
  vec3 normal = vec3(uv, z);
  vec3 p = uRotation * normal * uScale + uOffset;

  vec3 q = vec3(fbm(p), fbm(p + vec3(5.2, 1.3, 2.8)), fbm(p + vec3(1.7, 9.2, 4.1)));
  vec3 w = vec3(
    fbm(p + uWarp * q + vec3(8.3, 2.8, 1.1)),
    fbm(p + uWarp * q + vec3(2.1, 7.4, 3.3)),
    fbm(p + uWarp * q + vec3(4.4, 0.6, 6.2)));
  float t = clamp(fbm(p + uWarp * w) * 1.6 + 0.5 + uBias, 0.0, 1.0);

  vec3 color = mix(uDark, uMid, smoothstep(0.2, 0.7, t));
  color = mix(color, uAccent, smoothstep(0.02, 0.38, w.y) * 0.8);
  color = mix(color, uLight, smoothstep(0.64, 0.96, t) * 0.8);
  float ridge = 1.0 - smoothstep(0.0, 0.14, abs(q.x + 0.5 * w.z - 0.05));
  color = mix(color, uLight, ridge * 0.18);

  float diffuse = clamp(dot(normal, normalize(vec3(uLightDirection, 0.45))), 0.0, 1.0);
  color *= 0.7 + 0.45 * diffuse;
  float litSide = clamp(dot(normalize(uv + 1e-5), uLightDirection), 0.0, 1.0);
  float rim = pow(1.0 - z, 2.2);
  color = mix(color, uLight, rim * litSide * 0.5);
  color *= 1.0 - 0.4 * rim * (1.0 - litSide);

  float grain = hash12(gl_FragCoord.xy + uOffset.xy * 17.0) - 0.5;
  float mottle = gradientNoise(vec3(gl_FragCoord.xy * 0.18, uOffset.z));
  color += grain * 0.13 + mottle * 0.05;

  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

const UNIFORMS = [
  "uDark",
  "uMid",
  "uLight",
  "uAccent",
  "uOffset",
  "uRotation",
  "uScale",
  "uWarp",
  "uBias",
  "uLightDirection",
] as const;

type Renderer = {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  uniforms: Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
};

/** null = not tried yet (or lost, and worth one more try); "unavailable" = give up for this page. */
let renderer: Renderer | "unavailable" | null = null;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("createShader failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "shader did not compile");
  }
  return shader;
}

function createRenderer(): Renderer | "unavailable" {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) return "unavailable";

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return "unavailable";
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    // A lost context is usually the GPU process restarting; the next draw builds a fresh one.
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      renderer = null;
    });

    const uniforms = Object.fromEntries(
      UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]),
    ) as Renderer["uniforms"];
    return { gl, canvas, uniforms };
  } catch {
    return "unavailable";
  }
}

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** Column-major Rz·Ry·Rx, the layout uniformMatrix3fv expects. */
function rotationMatrix([ax, ay, az]: VoiceOrbParams["rotation"]) {
  const [cx, sx, cy, sy, cz, sz] = [
    Math.cos(ax),
    Math.sin(ax),
    Math.cos(ay),
    Math.sin(ay),
    Math.cos(az),
    Math.sin(az),
  ];
  return new Float32Array([
    cz * cy,
    sz * cy,
    -sy,
    cz * sy * sx - sz * cx,
    sz * sy * sx + cz * cx,
    cy * sx,
    cz * sy * cx + sz * sx,
    sz * sy * cx - cz * sx,
    cy * cx,
  ]);
}

function draw({ gl, canvas, uniforms }: Renderer, params: VoiceOrbParams, pixels: number) {
  canvas.width = pixels;
  canvas.height = pixels;
  gl.viewport(0, 0, pixels, pixels);
  gl.uniform3fv(uniforms.uDark, rgb(params.palette.dark));
  gl.uniform3fv(uniforms.uMid, rgb(params.palette.mid));
  gl.uniform3fv(uniforms.uLight, rgb(params.palette.light));
  gl.uniform3fv(uniforms.uAccent, rgb(params.palette.accent));
  gl.uniform3fv(uniforms.uOffset, params.offset);
  gl.uniformMatrix3fv(uniforms.uRotation, false, rotationMatrix(params.rotation));
  gl.uniform1f(uniforms.uScale, params.scale);
  gl.uniform1f(uniforms.uWarp, params.warp);
  gl.uniform1f(uniforms.uBias, params.bias);
  gl.uniform2fv(uniforms.uLightDirection, params.light);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  // JPEG, not PNG: the corners are cropped by the element's border-radius, so no alpha is
  // needed, and grain is close to incompressible for PNG.
  return canvas.toDataURL("image/jpeg", 0.9);
}

// ---------------------------------------------------------------------------------------------
// The picture store: what VoiceOrb reads through useSyncExternalStore.

const PER_FRAME = 6;
/** Enough for every voice of several languages; past it the oldest is redrawn if it returns. */
const MAX_PICTURES = 1500;

const pictures = new Map<string, string>();
const waiting = new Map<string, { voiceId: string; pixels: number; requests: number }>();
const listeners = new Map<string, Set<() => void>>();
let frame = 0;

function devicePixels(size: number) {
  const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return Math.round(size * Math.min(ratio, 3));
}

function keyOf(voiceId: string, size: number) {
  return `${voiceId}@${devicePixels(size)}`;
}

function drain() {
  frame = 0;
  if (renderer === null) renderer = createRenderer();
  if (renderer === "unavailable") {
    waiting.clear();
    return;
  }

  let drawn = 0;
  for (const [key, job] of waiting) {
    if (drawn === PER_FRAME) break;
    waiting.delete(key);
    pictures.set(key, draw(renderer, voiceOrbParams(job.voiceId), job.pixels));
    drawn += 1;
    if (pictures.size > MAX_PICTURES) {
      const oldest = pictures.keys().next().value;
      if (oldest !== undefined) pictures.delete(oldest);
    }
    listeners.get(key)?.forEach((listener) => listener());
  }
  if (waiting.size > 0) frame = requestAnimationFrame(drain);
}

/** The drawn picture for this voice at this CSS size, if there is one yet. */
export function peekOrbPicture(voiceId: string, size: number): string | undefined {
  return pictures.get(keyOf(voiceId, size));
}

export function subscribeOrbPicture(voiceId: string, size: number, listener: () => void) {
  const key = keyOf(voiceId, size);
  const set = listeners.get(key) ?? new Set();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

/** Queue this orb for drawing. Returns the withdrawal, for a row that leaves before its turn. */
export function requestOrbPicture(voiceId: string, size: number): () => void {
  const key = keyOf(voiceId, size);
  if (renderer === "unavailable" || pictures.has(key)) return () => {};

  const job = waiting.get(key) ?? { voiceId, pixels: devicePixels(size), requests: 0 };
  job.requests += 1;
  waiting.set(key, job);
  if (!frame) frame = requestAnimationFrame(drain);

  return () => {
    const pending = waiting.get(key);
    if (pending && --pending.requests <= 0) waiting.delete(key);
  };
}
