"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { webglSurfaceProps } from "@/lib/visuals/webgl-surface";

type BeamsProps = {
  beamWidth?: number;
  beamHeight?: number;
  beamNumber?: number;
  lightColor?: string;
  speed?: number;
  noiseIntensity?: number;
  scale?: number;
  rotation?: number;
  className?: string;
};

type ThreeModule = typeof import("three");

const noiseGLSL = `
float random (in vec2 st) { return fract(sin(dot(st.xy,vec2(12.9898,78.233)))*43758.5453123); }
float noise (in vec2 st) {
    vec2 i = floor(st); vec2 f = fract(st);
    float a = random(i); float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0)); float d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
vec3 fade(vec3 t) {return t*t*t*(t*(t*6.0-15.0)+10.0);}
float cnoise(vec3 P){
  vec3 Pi0 = floor(P); vec3 Pi1 = Pi0 + vec3(1.0);
  Pi0 = mod(Pi0, 289.0); Pi1 = mod(Pi1, 289.0);
  vec3 Pf0 = fract(P); vec3 Pf1 = Pf0 - vec3(1.0);
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 iz0 = Pi0.zzzz; vec4 iz1 = Pi1.zzzz;
  vec4 ixy = permute(permute(ix) + iy);
  vec4 ixy0 = permute(ixy + iz0); vec4 ixy1 = permute(ixy + iz1);
  vec4 gx0 = ixy0 / 7.0; vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5; gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5); gy0 -= sz0 * (step(0.0, gy0) - 0.5);
  vec4 gx1 = ixy1 / 7.0; vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5; gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5); gy1 -= sz1 * (step(0.0, gy1) - 0.5);
  vec3 g000 = vec3(gx0.x,gy0.x,gz0.x); vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
  vec3 g010 = vec3(gx0.z,gy0.z,gz0.z); vec3 g110 = vec3(gx0.w,gy0.z,gz0.w);
  vec3 g001 = vec3(gx1.x,gy1.x,gz1.x); vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
  vec3 g011 = vec3(gx1.z,gy1.z,gz1.z); vec3 g111 = vec3(gx1.w,gy1.z,gz1.w);
  vec4 norm0 = taylorInvSqrt(vec4(dot(g000,g000),dot(g010,g010),dot(g100,g100),dot(g110,g110)));
  g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
  vec4 norm1 = taylorInvSqrt(vec4(dot(g001,g001),dot(g011,g011),dot(g101,g101),dot(g111,g111)));
  g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;
  float n000 = dot(g000, Pf0);
  float n100 = dot(g100, vec3(Pf1.x,Pf0.yz));
  float n010 = dot(g010, vec3(Pf0.x,Pf1.y,Pf0.z));
  float n110 = dot(g110, vec3(Pf1.xy,Pf0.z));
  float n001 = dot(g001, vec3(Pf0.xy,Pf1.z));
  float n101 = dot(g101, vec3(Pf1.x,Pf0.y,Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x,Pf1.yz));
  float n111 = dot(g111, Pf1);
  vec3 fade_xyz = fade(Pf0);
  vec4 n_z = mix(vec4(n000,n100,n010,n110),vec4(n001,n101,n011,n111),fade_xyz.z);
  vec2 n_yz = mix(n_z.xy,n_z.zw,fade_xyz.y);
  return 2.2 * mix(n_yz.x,n_yz.y,fade_xyz.x);
}
`;

function createStackedPlanesBufferGeometry(
  THREE: ThreeModule,
  n: number,
  width: number,
  height: number,
  spacing: number,
  heightSegments: number,
) {
  const geometry = new THREE.BufferGeometry();
  const numVertices = n * (heightSegments + 1) * 2;
  const numFaces = n * heightSegments * 2;
  const positions = new Float32Array(numVertices * 3);
  const indices = new Uint32Array(numFaces * 3);
  const uvs = new Float32Array(numVertices * 2);
  let vertexOffset = 0;
  let indexOffset = 0;
  let uvOffset = 0;
  const totalWidth = n * width + (n - 1) * spacing;
  const xOffsetBase = -totalWidth / 2;

  for (let i = 0; i < n; i += 1) {
    const xOffset = xOffsetBase + i * (width + spacing);
    const uvX = Math.random() * 300;
    const uvY = Math.random() * 300;

    for (let j = 0; j <= heightSegments; j += 1) {
      const y = height * (j / heightSegments - 0.5);
      positions.set([xOffset, y, 0, xOffset + width, y, 0], vertexOffset * 3);
      const uvRowY = j / heightSegments;
      uvs.set([uvX, uvRowY + uvY, uvX + 1, uvRowY + uvY], uvOffset);

      if (j < heightSegments) {
        const a = vertexOffset;
        const b = vertexOffset + 1;
        const c = vertexOffset + 2;
        const d = vertexOffset + 3;
        indices.set([a, b, c, c, b, d], indexOffset);
        indexOffset += 6;
      }

      vertexOffset += 2;
      uvOffset += 4;
    }
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function makeMaterial(
  THREE: ThreeModule,
  speed: number,
  noiseIntensity: number,
  scale: number,
) {
  const physical = THREE.ShaderLib.physical as {
    uniforms: Record<string, { value: unknown }>;
    vertexShader: string;
    fragmentShader: string;
    defines?: Record<string, string | number | boolean>;
  };
  const baseUniforms = THREE.UniformsUtils.clone(physical.uniforms) as Record<
    string,
    { value: unknown }
  >;
  const defaults = new THREE.MeshStandardMaterial();
  baseUniforms.diffuse.value = new THREE.Color(0, 0, 0);
  baseUniforms.roughness.value = 0.3;
  baseUniforms.metalness.value = 0.3;
  baseUniforms.envMapIntensity.value = 10;

  const uniforms = {
    ...baseUniforms,
    time: { value: 0 },
    uSpeed: { value: speed },
    uNoiseIntensity: { value: noiseIntensity },
    uScale: { value: scale },
  };

  const header = `
varying vec3 vEye;
varying float vNoise;
uniform float time;
uniform float uSpeed;
uniform float uNoiseIntensity;
uniform float uScale;
${noiseGLSL}`;

  const vertexHeader = `
float getPos(vec3 pos) {
  vec3 noisePos = vec3(pos.x * 0., pos.y - uv.y, pos.z + time * uSpeed * 3.) * uScale;
  return cnoise(noisePos);
}
vec3 getCurrentPos(vec3 pos) {
  vec3 newpos = pos;
  newpos.z += getPos(pos);
  return newpos;
}
vec3 getNormal(vec3 pos) {
  vec3 curpos = getCurrentPos(pos);
  vec3 nextposX = getCurrentPos(pos + vec3(0.01, 0.0, 0.0));
  vec3 nextposZ = getCurrentPos(pos + vec3(0.0, -0.01, 0.0));
  vec3 tangentX = normalize(nextposX - curpos);
  vec3 tangentZ = normalize(nextposZ - curpos);
  return normalize(cross(tangentZ, tangentX));
}`;

  let vertexShader = `${header}\n${vertexHeader}\n${physical.vertexShader}`;
  vertexShader = vertexShader.replace(
    "#include <begin_vertex>",
    "#include <begin_vertex>\ntransformed.z += getPos(transformed.xyz);",
  );
  vertexShader = vertexShader.replace(
    "#include <beginnormal_vertex>",
    "#include <beginnormal_vertex>\nobjectNormal = getNormal(position.xyz);",
  );

  let fragmentShader = `${header}\n${physical.fragmentShader}`;
  fragmentShader = fragmentShader.replace(
    "#include <dithering_fragment>",
    "#include <dithering_fragment>\nfloat randomNoise = noise(gl_FragCoord.xy);\ngl_FragColor.rgb -= randomNoise / 15. * uNoiseIntensity;",
  );

  defaults.dispose();

  return new THREE.ShaderMaterial({
    defines: physical.defines,
    uniforms,
    vertexShader,
    fragmentShader,
    lights: true,
    fog: true,
  });
}

export function Beams({
  beamWidth = 2,
  beamHeight = 15,
  beamNumber = 12,
  lightColor = "#ffffff",
  speed = 2,
  noiseIntensity = 1.75,
  scale = 0.2,
  rotation = 0,
  className,
}: BeamsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    async function mount() {
      const THREE = await import("three");
      if (cancelled || !containerRef.current) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);

      const width = containerRef.current.clientWidth || 1;
      const height = containerRef.current.clientHeight || 1;
      renderer.setSize(width, height);
      containerRef.current.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
      camera.position.set(0, 0, 20);

      scene.add(new THREE.AmbientLight(0xffffff, 1));

      const directionalLight = new THREE.DirectionalLight(lightColor, 1);
      directionalLight.position.set(0, 3, 10);
      const shadowCamera = directionalLight.shadow.camera as import("three").OrthographicCamera;
      shadowCamera.top = 24;
      shadowCamera.bottom = -24;
      shadowCamera.left = -24;
      shadowCamera.right = 24;
      shadowCamera.far = 64;
      directionalLight.shadow.bias = -0.004;
      scene.add(directionalLight);

      const group = new THREE.Group();
      group.rotation.z = (rotation * Math.PI) / 180;
      scene.add(group);

      const material = makeMaterial(THREE, speed, noiseIntensity, scale);
      const geometry = createStackedPlanesBufferGeometry(
        THREE,
        beamNumber,
        beamWidth,
        beamHeight,
        0,
        100,
      );
      const mesh = new THREE.Mesh(geometry, material);
      group.add(mesh);

      const onResize = () => {
        const nextWidth = containerRef.current?.clientWidth || 1;
        const nextHeight = containerRef.current?.clientHeight || 1;
        renderer.setSize(nextWidth, nextHeight);
        camera.aspect = nextWidth / nextHeight;
        camera.updateProjectionMatrix();
      };
      const resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(containerRef.current);

      const clock = new THREE.Clock();
      let raf = 0;
      const tick = () => {
        const delta = clock.getDelta();
        material.uniforms.time.value += 0.1 * delta;
        material.uniforms.uSpeed.value = speed;
        material.uniforms.uNoiseIntensity.value = noiseIntensity;
        material.uniforms.uScale.value = scale;
        directionalLight.color.set(lightColor);
        group.rotation.z = (rotation * Math.PI) / 180;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      cleanup = () => {
        cancelAnimationFrame(raf);
        resizeObserver.disconnect();
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
    }

    void mount();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [beamHeight, beamNumber, beamWidth, lightColor, noiseIntensity, rotation, scale, speed]);

  // Declares "a live WebGL canvas is on screen" so the theme toggle can skip its View
  // Transition sweep, which cannot snapshot a canvas and tears across it.
  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full", className)}
      {...webglSurfaceProps()}
    />
  );
}
