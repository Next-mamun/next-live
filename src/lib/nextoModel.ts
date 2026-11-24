import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type NextoEmoteId =
  | 'flip'
  | 'frontflip'
  | 'spin'
  | 'double_spin'
  | 'wave'
  | 'cheer'
  | 'dance'
  | 'bounce'
  | 'nod'
  | 'peek'
  | 'shy'
  | 'salute'
  | 'rocket'
  | 'shiver'
  | 'barrel'
  | 'wink_tilt';

export interface NextoEmoteMeta {
  id: NextoEmoteId;
  label: string;
  emoji: string;
  duration: number;
}

export const NEXTO_EMOTES: NextoEmoteMeta[] = [
  { id: 'flip', label: 'Backflip', emoji: '🔄', duration: 0.72 },
  { id: 'frontflip', label: 'Frontflip', emoji: '🤸', duration: 0.72 },
  { id: 'spin', label: '360° Spin', emoji: '🌀', duration: 0.68 },
  { id: 'double_spin', label: 'Super Spin', emoji: '💫', duration: 0.95 },
  { id: 'wave', label: 'Wave Hello', emoji: '👋', duration: 1.05 },
  { id: 'cheer', label: 'Happy Cheer', emoji: '🙌', duration: 0.95 },
  { id: 'dance', label: 'Groove Dance', emoji: '💃', duration: 1.3 },
  { id: 'bounce', label: 'Jelly Bounce', emoji: '🏀', duration: 0.9 },
  { id: 'nod', label: 'Happy Nod', emoji: '🙂', duration: 0.85 },
  { id: 'peek', label: 'Peek-a-Boo', emoji: '👀', duration: 1.1 },
  { id: 'shy', label: 'Shy Twist', emoji: '😊', duration: 1.05 },
  { id: 'salute', label: 'Polite Bow', emoji: '🙇', duration: 1.0 },
  { id: 'rocket', label: 'Rocket Boost', emoji: '🚀', duration: 1.05 },
  { id: 'shiver', label: 'Excited Wiggle', emoji: '⚡', duration: 0.85 },
  { id: 'barrel', label: 'Barrel Roll', emoji: '🛩️', duration: 0.76 },
  { id: 'wink_tilt', label: 'Cute Wink', emoji: '😉', duration: 0.95 },
];

export const DEFAULT_ROBOT_EMOTE: NextoEmoteId = 'flip';
export const DEFAULT_ROBOT_BRIGHTNESS = 100;

export function isValidNextoEmote(val: string | null | undefined): val is NextoEmoteId {
  return NEXTO_EMOTES.some((e) => e.id === val);
}

export function detectSoftwareWebGL(): boolean {
  if (typeof window === 'undefined') return false;
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  try {
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      const rendererName = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
      if (/SwiftShader|llvmpipe|Software Rasterizer|WARP/i.test(rendererName)) {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return true;
      }
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return false;
  } catch {
    return true;
  }
}

export interface NextoLightingRig {
  envRenderTarget: THREE.WebGLRenderTarget;
  hemiLight: THREE.HemisphereLight;
  keyLight: THREE.DirectionalLight;
  rimLight: THREE.DirectionalLight;
}

export function setupNextoLightingAndEnv(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  brightness = DEFAULT_ROBOT_BRIGHTNESS
): NextoLightingRig {
  const b = THREE.MathUtils.clamp(brightness, 50, 170) / 100;

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.04 * b;

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envRenderTarget = pmremGenerator.fromScene(roomEnv, 0.04);
  scene.environment = envRenderTarget.texture;
  scene.environmentIntensity = 0.28 * b;
  roomEnv.dispose();
  pmremGenerator.dispose();

  const hemiLight = new THREE.HemisphereLight(0xeef6ff, 0x3b82f6, 0.68 * b);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.02 * b);
  keyLight.position.set(2.4, 3.8, 3.4);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x60c8ff, 0.52 * b);
  rimLight.position.set(-3.0, 2.2, -2.6);
  scene.add(rimLight);

  return { envRenderTarget, hemiLight, keyLight, rimLight };
}

export function applyNextoBrightness(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  rig: NextoLightingRig,
  root: THREE.Object3D | null,
  brightness: number
): void {
  const b = THREE.MathUtils.clamp(brightness, 50, 170) / 100;
  renderer.toneMappingExposure = 1.04 * b;
  scene.environmentIntensity = 0.28 * b;
  rig.hemiLight.intensity = 0.68 * b;
  rig.keyLight.intensity = 1.02 * b;
  rig.rimLight.intensity = 0.52 * b;

  if (root) {
    const colorScale = THREE.MathUtils.clamp(0.75 + 0.25 * b, 0.72, 1.15);
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const rawMat of mats) {
        if (!rawMat || !(rawMat instanceof THREE.MeshStandardMaterial)) continue;
        if (rawMat.name === 'Blue_Gloss') {
          rawMat.color.setRGB(0.95 * colorScale, 0.98 * colorScale, Math.min(1.06, 1.0 * colorScale));
        }
      }
    });
  }
}

export function tuneNextoMaterials(root: THREE.Object3D, brightness = DEFAULT_ROBOT_BRIGHTNESS): void {
  const b = THREE.MathUtils.clamp(brightness, 50, 170) / 100;
  const colorScale = THREE.MathUtils.clamp(0.75 + 0.25 * b, 0.72, 1.15);

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const rawMat of mats) {
      if (!rawMat || !(rawMat instanceof THREE.MeshStandardMaterial)) continue;

      if (rawMat.name === 'Blue_Gloss') {
        rawMat.color.setRGB(0.95 * colorScale, 0.98 * colorScale, Math.min(1.06, 1.0 * colorScale));
        rawMat.roughness = 0.30;
        rawMat.envMapIntensity = 0.28;
        if ('clearcoat' in rawMat) {
          (rawMat as THREE.MeshPhysicalMaterial).clearcoat = 0.28;
          (rawMat as THREE.MeshPhysicalMaterial).clearcoatRoughness = 0.14;
        }
      } else if (rawMat.name === 'Eye_Black') {
        rawMat.envMapIntensity = 0.65;
      } else if (rawMat.name === 'Screen_Next') {
        rawMat.envMapIntensity = 0.18;
        rawMat.emissiveIntensity = 0.9;
      } else {
        rawMat.envMapIntensity = 0.24;
        rawMat.roughness = Math.max(rawMat.roughness, 0.30);
      }
      rawMat.needsUpdate = true;
    }
  });
}

export function disposeNextoRoot(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        for (const key of Object.keys(mat)) {
          const value = (mat as any)[key];
          if (value && value.isTexture) {
            value.dispose();
          }
        }
        mat.dispose();
      }
    }
  });
}

let staticSnapshotCache: string | null = null;
let staticSnapshotPromise: Promise<string | null> | null = null;

/**
 * Renders Nexto Final.glb once offscreen into a crisp transparent PNG data URL
 * so static Nexto icons across Settings, Features, and headers display the exact
 * 3D model without spawning extra live WebGL contexts or animations.
 */
export function getStaticNextoSnapshot(): Promise<string | null> {
  if (staticSnapshotCache) {
    return Promise.resolve(staticSnapshotCache);
  }
  if (staticSnapshotPromise) {
    return staticSnapshotPromise;
  }

  staticSnapshotPromise = new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve(null);
      return;
    }

    const size = 256;
    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer | null = null;

    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: !isSoftwareGl,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
    } catch {
      resolve(null);
      return;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.08, 5.0);

    const rig = setupNextoLightingAndEnv(renderer, scene, DEFAULT_ROBOT_BRIGHTNESS);
    const loader = new GLTFLoader();

    loader.load(
      '/nexto-final.glb',
      (gltf) => {
        try {
          const root = gltf.scene;
          const box = new THREE.Box3().setFromObject(root);
          const center = box.getCenter(new THREE.Vector3());
          const sizeVec = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z) || 1;
          const normScale = 2.35 / maxDim;

          root.scale.setScalar(normScale);
          root.position.set(
            -center.x * normScale,
            -center.y * normScale,
            -center.z * normScale
          );

          tuneNextoMaterials(root, DEFAULT_ROBOT_BRIGHTNESS);

          const pivot = new THREE.Group();
          pivot.add(root);
          pivot.rotation.y = -0.14;
          scene.add(pivot);

          renderer!.render(scene, camera);
          const dataUrl = renderer!.domElement.toDataURL('image/png');
          staticSnapshotCache = dataUrl;

          disposeNextoRoot(root);
          rig.envRenderTarget.dispose();
          scene.environment = null;
          const gl = renderer!.getContext();
          renderer!.dispose();
          gl.getExtension('WEBGL_lose_context')?.loseContext();

          resolve(dataUrl);
        } catch {
          try {
            rig.envRenderTarget.dispose();
            renderer?.dispose();
          } catch {}
          resolve(null);
        }
      },
      undefined,
      () => {
        try {
          rig.envRenderTarget.dispose();
          renderer?.dispose();
        } catch {}
        resolve(null);
      }
    );
  });

  return staticSnapshotPromise;
}
