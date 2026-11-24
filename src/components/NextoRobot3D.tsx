import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  applyNextoBrightness,
  DEFAULT_ROBOT_BRIGHTNESS,
  DEFAULT_ROBOT_EMOTE,
  detectSoftwareWebGL,
  disposeNextoRoot,
  NEXTO_EMOTES,
  NextoEmoteId,
  NextoLightingRig,
  setupNextoLightingAndEnv,
  tuneNextoMaterials,
} from '@/lib/nextoModel';

interface NextoRobot3DProps {
  size: number;
  brightness?: number;
  emote?: NextoEmoteId;
  emoteEnabled?: boolean;
  emoteNonce?: number;
  animationsEnabled?: boolean;
  lookTarget?: { x: number; y: number } | null;
  fallback: React.ReactNode;
}

interface EyeTarget {
  mesh: THREE.Mesh;
  baseScale: THREE.Vector3;
  side: 'left' | 'right';
}

interface ArmTarget {
  mesh: THREE.Mesh;
  side: 'left' | 'right';
}

function afterDraw(cb: () => void): number {
  return window.setTimeout(cb, 16);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const NextoRobot3D: React.FC<NextoRobot3DProps> = ({
  size,
  brightness = DEFAULT_ROBOT_BRIGHTNESS,
  emote = DEFAULT_ROBOT_EMOTE,
  emoteEnabled = true,
  emoteNonce = 0,
  animationsEnabled = true,
  lookTarget = null,
  fallback,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rigRef = useRef<NextoLightingRig | null>(null);
  const loadedRootRef = useRef<THREE.Object3D | null>(null);

  const sizeRef = useRef(size);
  const brightnessRef = useRef(brightness);
  const emoteRef = useRef<NextoEmoteId>(emote);
  const emoteEnabledRef = useRef(emoteEnabled);
  const animationsEnabledRef = useRef(animationsEnabled);
  const lookTargetRef = useRef(lookTarget);
  const forceTriggerEmoteRef = useRef<(() => void) | null>(null);
  const cancelEmoteRef = useRef<(() => void) | null>(null);

  const [isModelReady, setIsModelReady] = useState(false);
  const [hasWebGLError, setHasWebGLError] = useState(false);

  sizeRef.current = size;
  brightnessRef.current = brightness;
  emoteRef.current = emote;
  emoteEnabledRef.current = emoteEnabled;
  animationsEnabledRef.current = animationsEnabled;
  lookTargetRef.current = lookTarget;

  // Resize WebGL canvas cleanly when robotSize slider changes in Settings without reloading GLB
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setSize(size, size, false);
  }, [size]);

  // Apply Brightness slider updates live without reloading GLB
  useEffect(() => {
    if (!rendererRef.current || !sceneRef.current || !rigRef.current) return;
    applyNextoBrightness(
      rendererRef.current,
      sceneRef.current,
      rigRef.current,
      loadedRootRef.current,
      brightness
    );
  }, [brightness]);

  // Trigger live emote preview whenever user taps an emote in Settings
  useEffect(() => {
    if (emoteNonce <= 0) return;
    if (emoteEnabled) {
      forceTriggerEmoteRef.current?.();
    }
  }, [emoteNonce, emote, emoteEnabled]);

  // Stop any running emote cleanly when user switches Idle Emotes off
  useEffect(() => {
    if (!emoteEnabled) {
      cancelEmoteRef.current?.();
    }
  }, [emoteEnabled]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let rafId = 0;
    let timeoutId = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let rig: NextoLightingRig | null = null;
    let loadedModelRoot: THREE.Object3D | null = null;

    const isSoftwareGl = detectSoftwareWebGL();

    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setHasWebGLError(true);
      return;
    }

    rendererRef.current = renderer;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(sizeRef.current, sizeRef.current, false);

    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.pointerEvents = 'none';
    canvas.className = 'select-none';
    container.appendChild(canvas);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      if (!disposed) {
        setHasWebGLError(true);
      }
    };
    canvas.addEventListener('webglcontextlost', handleContextLost, false);

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.14, 5.45);

    rig = setupNextoLightingAndEnv(renderer, scene, brightnessRef.current);
    rigRef.current = rig;

    const modelPivot = new THREE.Group();
    scene.add(modelPivot);

    const eyeTargets: EyeTarget[] = [];
    const armTargets: ArmTarget[] = [];

    const loader = new GLTFLoader();
    loader.load(
      '/nexto-final.glb',
      (gltf) => {
        if (disposed) return;

        const root = gltf.scene;
        loadedModelRoot = root;
        loadedRootRef.current = root;

        const rawBox = new THREE.Box3().setFromObject(root);
        const rawCenter = rawBox.getCenter(new THREE.Vector3());
        const rawSize = rawBox.getSize(new THREE.Vector3());
        const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1;
        const normScale = 2.08 / maxDim;

        root.scale.setScalar(normScale);
        root.position.set(
          -rawCenter.x * normScale,
          -rawCenter.y * normScale,
          -rawCenter.z * normScale
        );

        tuneNextoMaterials(root, brightnessRef.current);

        // Re-pivot eyes & arms around their natural centers / shoulders
        root.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;

          if (obj.name === '12_Black eye' || obj.name === '14_Black eye' || /black.?eye/i.test(obj.name)) {
            if (obj.geometry) {
              obj.geometry.computeBoundingBox();
              const eyeBox = obj.geometry.boundingBox;
              if (eyeBox) {
                const eyeCenter = eyeBox.getCenter(new THREE.Vector3());
                obj.geometry.translate(-eyeCenter.x, -eyeCenter.y, -eyeCenter.z);
                obj.position.add(eyeCenter);
                eyeTargets.push({
                  mesh: obj,
                  baseScale: obj.scale.clone(),
                  side: eyeCenter.x < 0 ? 'left' : 'right',
                });
                return;
              }
            }
          }

          if (obj.name === '04_Rounded arm left' || obj.name === '05_Rounded arm right') {
            if (obj.geometry) {
              obj.geometry.computeBoundingBox();
              const armBox = obj.geometry.boundingBox;
              if (armBox) {
                const isLeft = obj.name.includes('left');
                const shoulder = new THREE.Vector3(
                  isLeft ? armBox.max.x - 0.1 : armBox.min.x + 0.1,
                  armBox.max.y - 0.14,
                  (armBox.min.z + armBox.max.z) / 2
                );
                obj.geometry.translate(-shoulder.x, -shoulder.y, -shoulder.z);
                obj.position.add(shoulder);
                armTargets.push({
                  mesh: obj,
                  side: isLeft ? 'left' : 'right',
                });
              }
            }
          }
        });

        modelPivot.add(root);
        if (renderer) {
          applyNextoBrightness(renderer, scene, rig!, root, brightnessRef.current);
          renderer.render(scene, camera);
        }
        setIsModelReady(true);
      },
      undefined,
      () => {
        if (!disposed) {
          setHasWebGLError(true);
        }
      }
    );

    const clock = new THREE.Clock();
    let elapsed = 0;

    // Blink schedule state
    let nextBlinkAt = 0.85;
    let blinkStartAt = -1;
    let pendingDoubleBlink = false;
    const BLINK_DURATION = 0.17;

    // Emote schedule state
    let nextEmoteAt = 1.35;
    let emoteStartAt = -1;
    let activeEmoteId: NextoEmoteId = emoteRef.current;

    forceTriggerEmoteRef.current = () => {
      activeEmoteId = emoteRef.current;
      emoteStartAt = elapsed;
    };
    cancelEmoteRef.current = () => {
      emoteStartAt = -1;
      nextEmoteAt = elapsed + 8.5 + Math.random() * 5.0;
    };

    let currentYaw = 0;
    let currentPitch = 0;
    let currentRoll = 0;

    const tick = () => {
      if (disposed || !renderer) return;

      const delta = Math.min(clock.getDelta(), 0.05);
      elapsed += delta;

      // 1. Eye blink state machine
      if (blinkStartAt < 0 && elapsed >= nextBlinkAt && eyeTargets.length > 0) {
        blinkStartAt = elapsed;
      }

      let blinkClose = 0;
      if (blinkStartAt >= 0) {
        const progress = (elapsed - blinkStartAt) / BLINK_DURATION;
        if (progress >= 1) {
          blinkStartAt = -1;
          blinkClose = 0;
          if (pendingDoubleBlink) {
            pendingDoubleBlink = false;
            nextBlinkAt = elapsed + 0.14;
          } else {
            pendingDoubleBlink = Math.random() < 0.24;
            nextBlinkAt = elapsed + 2.3 + Math.random() * 2.5;
          }
        } else {
          blinkClose =
            progress < 0.42
              ? Math.sin((progress / 0.42) * (Math.PI / 2))
              : Math.cos(((progress - 0.42) / 0.58) * (Math.PI / 2));
        }
      }

      // 2. Idle / Bored Emote state machine
      const targetLook = lookTargetRef.current;
      if (emoteEnabledRef.current && emoteStartAt < 0 && loadedModelRoot && elapsed >= nextEmoteAt) {
        if (!targetLook) {
          activeEmoteId = emoteRef.current;
          emoteStartAt = elapsed;
        } else {
          nextEmoteAt = elapsed + 2.5;
        }
      }

      let emoteRotX = 0;
      let emoteRotY = 0;
      let emoteRotZ = 0;
      let emotePosX = 0;
      let emotePosY = 0;
      let emoteScaleX = 1;
      let emoteScaleY = 1;
      let emoteScaleZ = 1;
      let leftArmRotZ = 0;
      let leftArmRotX = 0;
      let rightArmRotZ = 0;
      let rightArmRotX = 0;
      let leftEyeExtraClose = 0;
      let rightEyeExtraClose = 0;
      let eyePopScale = 1;

      if (emoteStartAt >= 0 && emoteEnabledRef.current) {
        const meta = NEXTO_EMOTES.find((m) => m.id === activeEmoteId) || NEXTO_EMOTES[0];
        const p = (elapsed - emoteStartAt) / meta.duration;
        if (p >= 1) {
          emoteStartAt = -1;
          nextEmoteAt = elapsed + 8.5 + Math.random() * 5.0;
        } else {
          const ease = easeInOutCubic(p);
          const bell = Math.sin(p * Math.PI);

          switch (activeEmoteId) {
            case 'flip':
              emoteRotX = -ease * Math.PI * 2;
              emotePosY = bell * 0.28;
              emoteRotZ = Math.sin(p * Math.PI * 2) * 0.1;
              leftArmRotZ = -bell * 0.35;
              rightArmRotZ = bell * 0.35;
              break;
            case 'frontflip':
              emoteRotX = ease * Math.PI * 2;
              emotePosY = bell * 0.26;
              if (p > 0.8) {
                const land = Math.sin(((p - 0.8) / 0.2) * Math.PI);
                emoteScaleY = 1 - land * 0.1;
                emoteScaleX = 1 + land * 0.06;
                emoteScaleZ = 1 + land * 0.06;
              }
              break;
            case 'spin':
              emoteRotY = ease * Math.PI * 2;
              emotePosY = bell * 0.18;
              leftArmRotZ = -bell * 0.45;
              rightArmRotZ = bell * 0.45;
              break;
            case 'double_spin':
              emoteRotY = ease * Math.PI * 4;
              emotePosY = bell * 0.24;
              leftArmRotZ = -bell * 0.55;
              rightArmRotZ = bell * 0.55;
              break;
            case 'wave': {
              const envelope = Math.sin(p * Math.PI);
              emoteRotZ = -0.14 * envelope;
              emoteRotY = 0.22 * envelope;
              rightArmRotZ = envelope * (0.85 + Math.sin(p * Math.PI * 6) * 0.35);
              rightArmRotX = -envelope * 0.25;
              rightEyeExtraClose = envelope > 0.55 ? (envelope - 0.55) * 1.4 : 0;
              break;
            }
            case 'cheer': {
              const hops = Math.abs(Math.sin(p * Math.PI * 2));
              emotePosY = hops * 0.22;
              leftArmRotZ = -hops * 0.88;
              rightArmRotZ = hops * 0.88;
              emoteScaleY = 1 + hops * 0.06;
              emoteScaleX = 1 - hops * 0.03;
              break;
            }
            case 'dance': {
              const sway = Math.sin(p * Math.PI * 4);
              const env = Math.sin(p * Math.PI);
              emoteRotZ = sway * 0.18 * env;
              emoteRotY = sway * 0.24 * env;
              emotePosX = sway * 0.08 * env;
              emotePosY = Math.abs(Math.cos(p * Math.PI * 4)) * 0.09 * env;
              leftArmRotZ = (-0.35 + sway * 0.45) * env;
              rightArmRotZ = (0.35 + sway * 0.45) * env;
              break;
            }
            case 'bounce': {
              const jump = Math.abs(Math.sin(p * Math.PI * 2));
              const squash = p < 0.16 || (p > 0.42 && p < 0.58) || p > 0.84 ? Math.sin(p * Math.PI * 6) : 0;
              emotePosY = jump * 0.26 - Math.max(0, -squash) * 0.06;
              emoteScaleY = 1 + (jump - 0.3) * 0.14;
              emoteScaleX = 1 - (jump - 0.3) * 0.08;
              emoteScaleZ = emoteScaleX;
              break;
            }
            case 'nod': {
              const nodWave = Math.max(0, Math.sin(p * Math.PI * 4));
              emoteRotX = nodWave * 0.32;
              emotePosY = -nodWave * 0.04;
              leftEyeExtraClose = nodWave * 0.5;
              rightEyeExtraClose = nodWave * 0.5;
              break;
            }
            case 'peek':
              if (p < 0.48) {
                const hide = easeInOutCubic(p / 0.48);
                emotePosY = -hide * 0.32;
                emoteRotX = hide * 0.28;
                emoteScaleX = 1 - hide * 0.12;
                emoteScaleY = 1 - hide * 0.12;
                emoteScaleZ = 1 - hide * 0.12;
                leftArmRotZ = -hide * 0.6;
                rightArmRotZ = hide * 0.6;
              } else {
                const pop = Math.sin(((p - 0.48) / 0.52) * Math.PI);
                emotePosY = pop * 0.2;
                emoteScaleX = 1 + pop * 0.1;
                emoteScaleY = 1 + pop * 0.1;
                emoteScaleZ = 1 + pop * 0.1;
                eyePopScale = 1 + pop * 0.16;
                leftArmRotZ = -pop * 0.65;
                rightArmRotZ = pop * 0.65;
              }
              break;
            case 'shy': {
              const wiggle = Math.sin(p * Math.PI * 3);
              const env = Math.sin(p * Math.PI);
              emoteRotY = wiggle * 0.34 * env;
              emoteRotX = 0.14 * env;
              emoteRotZ = -wiggle * 0.08 * env;
              leftArmRotZ = 0.25 * env;
              rightArmRotZ = -0.25 * env;
              leftEyeExtraClose = Math.abs(wiggle) * 0.35 * env;
              rightEyeExtraClose = Math.abs(wiggle) * 0.35 * env;
              break;
            }
            case 'salute': {
              const bowCurve = Math.sin(p * Math.PI);
              emoteRotX = bowCurve * 0.45;
              emotePosY = -bowCurve * 0.08;
              rightArmRotZ = bowCurve * 0.72;
              rightArmRotX = -bowCurve * 0.45;
              break;
            }
            case 'rocket':
              if (p < 0.25) {
                const coil = easeInOutCubic(p / 0.25);
                emotePosY = -coil * 0.12;
                emoteScaleY = 1 - coil * 0.14;
                emoteScaleX = 1 + coil * 0.08;
                emoteScaleZ = emoteScaleX;
              } else {
                const air = (p - 0.25) / 0.75;
                const arc = Math.sin(air * Math.PI);
                emotePosY = arc * 0.34;
                emoteRotY = Math.sin(air * Math.PI * 2) * 0.25;
                emoteScaleY = 1 + arc * 0.08;
                emoteScaleX = 1 - arc * 0.05;
                emoteScaleZ = emoteScaleX;
                leftArmRotZ = -arc * 0.5;
                rightArmRotZ = arc * 0.5;
              }
              break;
            case 'shiver': {
              const env = Math.sin(p * Math.PI);
              const buzz = Math.sin(p * Math.PI * 12);
              emoteRotZ = buzz * 0.16 * env;
              emotePosX = buzz * 0.07 * env;
              emotePosY = Math.abs(Math.sin(p * Math.PI * 4)) * 0.1 * env;
              leftArmRotZ = (-0.3 + buzz * 0.3) * env;
              rightArmRotZ = (0.3 - buzz * 0.3) * env;
              break;
            }
            case 'barrel':
              emoteRotZ = ease * Math.PI * 2;
              emotePosY = bell * 0.24;
              leftArmRotZ = -bell * 0.4;
              rightArmRotZ = bell * 0.4;
              break;
            case 'wink_tilt': {
              const env = Math.sin(p * Math.PI);
              emoteRotZ = 0.24 * env;
              emoteRotY = -0.22 * env;
              emotePosY = env * 0.08;
              rightArmRotZ = env * 0.45;
              rightEyeExtraClose = Math.min(1, env * 1.45);
              break;
            }
          }
        }
      }

      // Apply Eye Blink + Wink + Pop scales
      for (const eye of eyeTargets) {
        const specificClose = eye.side === 'left' ? leftEyeExtraClose : rightEyeExtraClose;
        const closeAmount = Math.min(1, Math.max(blinkClose, specificClose));
        eye.mesh.scale.y = eye.baseScale.y * eyePopScale * (1 - 0.94 * closeAmount);
        eye.mesh.scale.x = eye.baseScale.x * eyePopScale * (1 + 0.12 * closeAmount);
        eye.mesh.scale.z = eye.baseScale.z * eyePopScale;
      }

      // Apply Shoulder-pivoted Arm Animations
      for (const arm of armTargets) {
        if (arm.side === 'left') {
          arm.mesh.rotation.z = leftArmRotZ;
          arm.mesh.rotation.x = leftArmRotX;
        } else {
          arm.mesh.rotation.z = rightArmRotZ;
          arm.mesh.rotation.x = rightArmRotX;
        }
      }

      // 3. Subtle floating + pointer look-at damping combined with active emote
      if (animationsEnabledRef.current) {
        const idleYaw = Math.sin(elapsed * 0.95) * 0.11;
        const idlePitch = Math.sin(elapsed * 1.45) * 0.035;
        const idleRoll = Math.sin(elapsed * 0.8) * 0.025;

        const targetYaw = targetLook ? THREE.MathUtils.clamp(targetLook.x * 0.34, -0.34, 0.34) : idleYaw;
        const targetPitch = targetLook ? THREE.MathUtils.clamp(targetLook.y * 0.18, -0.18, 0.18) : idlePitch;
        const targetRoll = targetLook ? THREE.MathUtils.clamp(-targetLook.x * 0.08, -0.08, 0.08) : idleRoll;

        currentYaw = THREE.MathUtils.damp(currentYaw, targetYaw, 6, delta);
        currentPitch = THREE.MathUtils.damp(currentPitch, targetPitch, 6, delta);
        currentRoll = THREE.MathUtils.damp(currentRoll, targetRoll, 6, delta);

        modelPivot.rotation.set(
          currentPitch + emoteRotX,
          currentYaw + emoteRotY,
          currentRoll + emoteRotZ
        );
        modelPivot.position.set(
          emotePosX,
          Math.sin(elapsed * 2.15) * 0.055 + emotePosY,
          0
        );
        modelPivot.scale.set(emoteScaleX, emoteScaleY, emoteScaleZ);
      } else {
        currentYaw = THREE.MathUtils.damp(currentYaw, 0, 8, delta);
        currentPitch = THREE.MathUtils.damp(currentPitch, 0, 8, delta);
        currentRoll = THREE.MathUtils.damp(currentRoll, 0, 8, delta);
        modelPivot.rotation.set(
          currentPitch + emoteRotX,
          currentYaw + emoteRotY,
          currentRoll + emoteRotZ
        );
        modelPivot.position.set(emotePosX, emotePosY, 0);
        modelPivot.scale.set(emoteScaleX, emoteScaleY, emoteScaleZ);
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        timeoutId = afterDraw(tick);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };

    if (isSoftwareGl) {
      timeoutId = afterDraw(tick);
    } else {
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      forceTriggerEmoteRef.current = null;
      cancelEmoteRef.current = null;
      if (rafId) cancelAnimationFrame(rafId);
      if (timeoutId) clearTimeout(timeoutId);

      canvas.removeEventListener('webglcontextlost', handleContextLost);

      if (loadedModelRoot) {
        disposeNextoRoot(loadedModelRoot);
      }
      loadedRootRef.current = null;

      if (rig) {
        rig.envRenderTarget.dispose();
      }
      rigRef.current = null;
      scene.environment = null;
      sceneRef.current = null;

      if (renderer) {
        renderer.dispose();
        if (canvas.parentNode === container) {
          container.removeChild(canvas);
        }
      }
      rendererRef.current = null;
    };
  }, []);

  if (hasWebGLError) {
    return <>{fallback}</>;
  }

  return (
    <div
      style={{ width: size, height: size }}
      className="relative cursor-pointer active:cursor-grabbing select-none drop-shadow-[0_10px_18px_rgba(24,119,242,0.28)]"
      aria-label="Nexto 3D Robot"
    >
      {!isModelReady && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {fallback}
        </div>
      )}
      <div
        ref={containerRef}
        style={{ width: size, height: size }}
        className={`w-full h-full transition-opacity duration-200 pointer-events-none select-none ${
          isModelReady ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
};

export default NextoRobot3D;
