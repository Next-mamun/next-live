import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export * from './nextoEmotes';

export type NextoRobotMode = '3d' | '2d';
export const DEFAULT_ROBOT_MODE: NextoRobotMode = '3d';

export const MIN_ROBOT_BRIGHTNESS = 60;
export const MAX_ROBOT_BRIGHTNESS = 155;
export const DEFAULT_ROBOT_BRIGHTNESS = MAX_ROBOT_BRIGHTNESS;

export const NEXTO_POSTER_CACHE_KEY = 'nexto_3d_poster_v1';

// Shared GLB binary cache so the model begins fetching immediately and parses instantly
let glbArrayBufferPromise: Promise<ArrayBuffer> | null = null;

export function preloadNextoGlbBuffer(): Promise<ArrayBuffer> {
  if (!glbArrayBufferPromise) {
    glbArrayBufferPromise = fetch('/nexto-final.glb', {
      cache: 'force-cache',
    }).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    });
  }
  return glbArrayBufferPromise;
}

export async function loadNextoGltf(): Promise<GLTF> {
  const loader = new GLTFLoader();
  try {
    const buffer = await preloadNextoGlbBuffer();
    const copy = buffer.slice(0);
    return await new Promise<GLTF>((resolve, reject) => {
      loader.parse(copy, '/', resolve, reject);
    });
  } catch {
    glbArrayBufferPromise = null;
    return await new Promise<GLTF>((resolve, reject) => {
      loader.load('/nexto-final.glb', resolve, undefined, reject);
    });
  }
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
  const b = THREE.MathUtils.clamp(brightness, MIN_ROBOT_BRIGHTNESS, MAX_ROBOT_BRIGHTNESS) / 100;

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.72 + 0.42 * b;

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envRenderTarget = pmremGenerator.fromScene(roomEnv, 0.04);
  scene.environment = envRenderTarget.texture;
  scene.environmentIntensity = 0.14 + 0.16 * b;
  roomEnv.dispose();
  pmremGenerator.dispose();

  const hemiLight = new THREE.HemisphereLight(0xf0f8ff, 0x3b82f6, 0.44 + 0.36 * b);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.56 + 0.52 * b);
  keyLight.position.set(2.4, 3.8, 3.4);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x60c8ff, 0.28 + 0.26 * b);
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
  const b = THREE.MathUtils.clamp(brightness, MIN_ROBOT_BRIGHTNESS, MAX_ROBOT_BRIGHTNESS) / 100;
  renderer.toneMappingExposure = 0.72 + 0.42 * b;
  scene.environmentIntensity = 0.14 + 0.16 * b;
  rig.hemiLight.intensity = 0.44 + 0.36 * b;
  rig.keyLight.intensity = 0.56 + 0.52 * b;
  rig.rimLight.intensity = 0.28 + 0.26 * b;

  if (root) {
    const colorScale = THREE.MathUtils.clamp(0.70 + 0.28 * b, 0.72, 1.15);
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const rawMat of mats) {
        if (!rawMat || !(rawMat instanceof THREE.MeshStandardMaterial)) continue;
        if (rawMat.name === 'Blue_Gloss') {
          rawMat.color.setRGB(0.92 * colorScale, 0.97 * colorScale, Math.min(1.08, 1.02 * colorScale));
        }
      }
    });
  }
}

export function tuneNextoMaterials(root: THREE.Object3D, brightness = DEFAULT_ROBOT_BRIGHTNESS): void {
  const b = THREE.MathUtils.clamp(brightness, MIN_ROBOT_BRIGHTNESS, MAX_ROBOT_BRIGHTNESS) / 100;
  const colorScale = THREE.MathUtils.clamp(0.70 + 0.28 * b, 0.72, 1.15);

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const rawMat of mats) {
      if (!rawMat || !(rawMat instanceof THREE.MeshStandardMaterial)) continue;

      if (rawMat.name === 'Blue_Gloss') {
        rawMat.color.setRGB(0.92 * colorScale, 0.97 * colorScale, Math.min(1.08, 1.02 * colorScale));
        rawMat.roughness = 0.28;
        rawMat.envMapIntensity = 0.28;
        if ('clearcoat' in rawMat) {
          (rawMat as THREE.MeshPhysicalMaterial).clearcoat = 0.26;
          (rawMat as THREE.MeshPhysicalMaterial).clearcoatRoughness = 0.14;
        }
      } else if (rawMat.name === 'Eye_Black') {
        rawMat.envMapIntensity = 0.65;
      } else if (rawMat.name === 'Screen_Next') {
        rawMat.envMapIntensity = 0.18;
        rawMat.emissiveIntensity = 0.92;
      } else {
        rawMat.envMapIntensity = 0.24;
        rawMat.roughness = Math.max(rawMat.roughness, 0.28);
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

export interface NextoRiggedParts {
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  leftArmGroup: THREE.Group;
  rightArmGroup: THREE.Group;
  leftAntennaGroup: THREE.Group;
  rightAntennaGroup: THREE.Group;
  leftEyeGroup: THREE.Group;
  rightEyeGroup: THREE.Group;
  mouthGroup: THREE.Group;
  leftCheekGroup: THREE.Group;
  rightCheekGroup: THREE.Group;
}

function attachPartToPivot(
  parentGroup: THREE.Group,
  mesh: THREE.Object3D,
  pivotX: number,
  pivotY: number,
  pivotZ: number
): void {
  mesh.position.set(-pivotX, -pivotY, -pivotZ);
  parentGroup.add(mesh);
}

/**
 * Re-pivots all 20 GLB meshes into articulated THREE.Group joints using numeric
 * prefixes (00_..19_) so GLTFLoader space->underscore sanitization never drops a part.
 */
export function buildRiggedNextoRobot(root: THREE.Object3D): NextoRiggedParts {
  const NECK = new THREE.Vector3(0, 1.35, 0);
  const ARM_L = new THREE.Vector3(-0.78, 1.22, 0);
  const ARM_R = new THREE.Vector3(0.78, 1.22, 0);
  const ANT_L = new THREE.Vector3(-0.67, 2.28, 0);
  const ANT_R = new THREE.Vector3(0.67, 2.28, 0);
  const EYE_L = new THREE.Vector3(-0.37, 1.92, 0.53);
  const EYE_R = new THREE.Vector3(0.37, 1.92, 0.53);
  const MOUTH = new THREE.Vector3(0, 1.7, 0.51);
  const CHEEK_L = new THREE.Vector3(-0.62, 1.8, 0.38);
  const CHEEK_R = new THREE.Vector3(0.62, 1.8, 0.38);

  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const headGroup = new THREE.Group();
  headGroup.position.copy(NECK);
  bodyGroup.add(headGroup);

  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.copy(ARM_L);
  bodyGroup.add(leftArmGroup);

  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.copy(ARM_R);
  bodyGroup.add(rightArmGroup);

  const leftAntennaGroup = new THREE.Group();
  leftAntennaGroup.position.copy(ANT_L).sub(NECK);
  headGroup.add(leftAntennaGroup);

  const rightAntennaGroup = new THREE.Group();
  rightAntennaGroup.position.copy(ANT_R).sub(NECK);
  headGroup.add(rightAntennaGroup);

  const leftEyeGroup = new THREE.Group();
  leftEyeGroup.position.copy(EYE_L).sub(NECK);
  headGroup.add(leftEyeGroup);

  const rightEyeGroup = new THREE.Group();
  rightEyeGroup.position.copy(EYE_R).sub(NECK);
  headGroup.add(rightEyeGroup);

  const mouthGroup = new THREE.Group();
  mouthGroup.position.copy(MOUTH).sub(NECK);
  headGroup.add(mouthGroup);

  const leftCheekGroup = new THREE.Group();
  leftCheekGroup.position.copy(CHEEK_L).sub(NECK);
  headGroup.add(leftCheekGroup);

  const rightCheekGroup = new THREE.Group();
  rightCheekGroup.position.copy(CHEEK_R).sub(NECK);
  headGroup.add(rightCheekGroup);

  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      meshes.push(obj as THREE.Mesh);
    }
  });

  for (const obj of meshes) {
    const n = obj.name || '';
    if (n.startsWith('01_')) {
      attachPartToPivot(headGroup, obj, NECK.x, NECK.y, NECK.z);
    } else if (n.startsWith('04_')) {
      attachPartToPivot(leftArmGroup, obj, ARM_L.x, ARM_L.y, ARM_L.z);
    } else if (n.startsWith('05_')) {
      attachPartToPivot(rightArmGroup, obj, ARM_R.x, ARM_R.y, ARM_R.z);
    } else if (n.startsWith('06_') || n.startsWith('07_') || n.startsWith('08_')) {
      attachPartToPivot(leftAntennaGroup, obj, ANT_L.x, ANT_L.y, ANT_L.z);
    } else if (n.startsWith('09_') || n.startsWith('10_') || n.startsWith('11_')) {
      attachPartToPivot(rightAntennaGroup, obj, ANT_R.x, ANT_R.y, ANT_R.z);
    } else if (n.startsWith('12_')) {
      attachPartToPivot(leftEyeGroup, obj, EYE_L.x, EYE_L.y, EYE_L.z);
    } else if (n.startsWith('14_')) {
      attachPartToPivot(rightEyeGroup, obj, EYE_R.x, EYE_R.y, EYE_R.z);
    } else if (n.startsWith('13_')) {
      attachPartToPivot(leftCheekGroup, obj, CHEEK_L.x, CHEEK_L.y, CHEEK_L.z);
    } else if (n.startsWith('15_')) {
      attachPartToPivot(rightCheekGroup, obj, CHEEK_R.x, CHEEK_R.y, CHEEK_R.z);
    } else if (n.startsWith('16_') || n.startsWith('17_')) {
      attachPartToPivot(mouthGroup, obj, MOUTH.x, MOUTH.y, MOUTH.z);
    } else {
      // Torso (00_), collar (02_, 03_), and chest display (18_, 19_) move with bodyGroup
      bodyGroup.add(obj);
    }
  }

  return {
    bodyGroup,
    headGroup,
    leftArmGroup,
    rightArmGroup,
    leftAntennaGroup,
    rightAntennaGroup,
    leftEyeGroup,
    rightEyeGroup,
    mouthGroup,
    leftCheekGroup,
    rightCheekGroup,
  };
}

let staticSnapshotCache: string | null = null;
let staticSnapshotPromise: Promise<string | null> | null = null;

export function getCachedNextoPosterSync(): string | null {
  if (staticSnapshotCache) return staticSnapshotCache;
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(NEXTO_POSTER_CACHE_KEY);
    if (cached && cached.startsWith('data:image/')) {
      staticSnapshotCache = cached;
      return cached;
    }
  } catch {}
  return null;
}

export function saveCachedNextoPoster(dataUrl: string): void {
  staticSnapshotCache = dataUrl;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NEXTO_POSTER_CACHE_KEY, dataUrl);
  } catch {}
}

/**
 * Renders Nexto Final.glb once offscreen into a crisp transparent PNG data URL
 * so static Nexto icons and instant 3D boot posters display the exact 3D model.
 */
export function getStaticNextoSnapshot(): Promise<string | null> {
  const existing = getCachedNextoPosterSync();
  if (existing) {
    return Promise.resolve(existing);
  }
  if (staticSnapshotPromise) {
    return staticSnapshotPromise;
  }

  staticSnapshotPromise = new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve(null);
      return;
    }

    const size = 200;
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
    camera.position.set(0, 0.08, 5.15);

    const rig = setupNextoLightingAndEnv(renderer, scene, DEFAULT_ROBOT_BRIGHTNESS);

    loadNextoGltf()
      .then((gltf) => {
        try {
          const root = gltf.scene;
          const box = new THREE.Box3().setFromObject(root);
          const center = box.getCenter(new THREE.Vector3());
          const sizeVec = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z) || 1;
          const normScale = 2.24 / maxDim;

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
          saveCachedNextoPoster(dataUrl);

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
      })
      .catch(() => {
        try {
          rig.envRenderTarget.dispose();
          renderer?.dispose();
        } catch {}
        resolve(null);
      });
  });

  return staticSnapshotPromise;
}
