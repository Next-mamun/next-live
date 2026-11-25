import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  AnyNextoEmoteId,
  applyNextoBrightness,
  buildRiggedNextoRobot,
  DEFAULT_ROBOT_BRIGHTNESS,
  DEFAULT_ROBOT_EMOTE,
  detectSoftwareWebGL,
  disposeNextoRoot,
  evaluateCustomRobotEmote,
  evaluateNextoEmote,
  getCachedNextoPosterSync,
  getCustomNextoEmotes,
  getStaticNextoSnapshot,
  isBuiltinNextoEmote,
  isCustomEmoteId,
  loadNextoGltf,
  NEXTO_EMOTES,
  NextoLightingRig,
  NextoPose,
  NextoRiggedParts,
  RobotEmote,
  setupNextoLightingAndEnv,
  tuneNextoMaterials,
} from '@/lib/nextoModel';

interface NextoRobot3DProps {
  size: number;
  brightness?: number;
  emote?: AnyNextoEmoteId;
  activeEmote?: RobotEmote | null;
  loopEmote?: boolean;
  emoteEnabled?: boolean;
  emoteNonce?: number;
  animationsEnabled?: boolean;
  lookTarget?: { x: number; y: number } | null;
  voiceState?: 'idle' | 'listening' | 'speaking';
  audioLevel?: number;
}

function afterDraw(cb: () => void): number {
  return window.setTimeout(cb, 16);
}

const NextoRobot3D: React.FC<NextoRobot3DProps> = ({
  size,
  brightness = DEFAULT_ROBOT_BRIGHTNESS,
  emote = DEFAULT_ROBOT_EMOTE,
  activeEmote = null,
  loopEmote = false,
  emoteEnabled = true,
  emoteNonce = 0,
  animationsEnabled = true,
  lookTarget = null,
  voiceState = 'idle',
  audioLevel = 0,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rigRef = useRef<NextoLightingRig | null>(null);
  const loadedRootRef = useRef<THREE.Object3D | null>(null);

  const sizeRef = useRef(size);
  const brightnessRef = useRef(brightness);
  const emoteRef = useRef<AnyNextoEmoteId>(emote);
  const activeEmoteRef = useRef<RobotEmote | null>(activeEmote);
  const loopEmoteRef = useRef(loopEmote);
  const emoteEnabledRef = useRef(emoteEnabled);
  const animationsEnabledRef = useRef(animationsEnabled);
  const lookTargetRef = useRef(lookTarget);
  const voiceStateRef = useRef(voiceState);
  const audioLevelRef = useRef(audioLevel);
  const forceTriggerEmoteRef = useRef<(() => void) | null>(null);
  const cancelEmoteRef = useRef<(() => void) | null>(null);

  const [isModelReady, setIsModelReady] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(() => getCachedNextoPosterSync());

  sizeRef.current = size;
  brightnessRef.current = brightness;
  emoteRef.current = emote;
  activeEmoteRef.current = activeEmote;
  loopEmoteRef.current = loopEmote;
  emoteEnabledRef.current = emoteEnabled;
  animationsEnabledRef.current = animationsEnabled;
  lookTargetRef.current = lookTarget;
  voiceStateRef.current = voiceState;
  audioLevelRef.current = audioLevel;

  useEffect(() => {
    if (posterUrl) return;
    getStaticNextoSnapshot().then((url) => {
      if (url) setPosterUrl(url);
    });
  }, [posterUrl]);

  // Resize WebGL canvas cleanly when robotSize slider changes without reloading GLB
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
    let lightingRig: NextoLightingRig | null = null;
    let loadedModelRoot: THREE.Object3D | null = null;
    let riggedParts: NextoRiggedParts | null = null;

    const isSoftwareGl = detectSoftwareWebGL();

    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
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
    };
    canvas.addEventListener('webglcontextlost', handleContextLost, false);

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.14, 5.45);

    lightingRig = setupNextoLightingAndEnv(renderer, scene, brightnessRef.current);
    rigRef.current = lightingRig;

    const modelPivot = new THREE.Group();
    scene.add(modelPivot);

    loadNextoGltf()
      .then((gltf) => {
        if (disposed) return;

        const root = gltf.scene;
        loadedModelRoot = root;
        loadedRootRef.current = root;

        const rawBox = new THREE.Box3().setFromObject(root);
        const rawCenter = rawBox.getCenter(new THREE.Vector3());
        const rawSize = rawBox.getSize(new THREE.Vector3());
        const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1;
        const normScale = 2.08 / maxDim;

        // Prefix-based hierarchical joint rigging (00_..19_)
        riggedParts = buildRiggedNextoRobot(root);

        root.scale.setScalar(normScale);
        root.position.set(
          -rawCenter.x * normScale,
          -rawCenter.y * normScale,
          -rawCenter.z * normScale
        );

        tuneNextoMaterials(root, brightnessRef.current);

        modelPivot.add(root);
        if (renderer) {
          applyNextoBrightness(renderer, scene, lightingRig!, root, brightnessRef.current);
          renderer.render(scene, camera);
        }
        setIsModelReady(true);
      })
      .catch(() => {});

    const clock = new THREE.Clock();
    let elapsed = 0;

    // Blink schedule state (~every 3.2s)
    let nextBlinkAt = 0.85;
    let blinkStartAt = -1;
    let pendingDoubleBlink = false;
    const BLINK_DURATION = 0.16;

    // Emote schedule state
    let nextEmoteAt = 0.35;
    let emoteStartAt = -1;
    let runningEmoteId: AnyNextoEmoteId = emoteRef.current;

    forceTriggerEmoteRef.current = () => {
      runningEmoteId = emoteRef.current;
      emoteStartAt = elapsed;
    };
    cancelEmoteRef.current = () => {
      emoteStartAt = -1;
      nextEmoteAt = elapsed + 8.5 + Math.random() * 5.0;
    };

    let currentYaw = 0;
    let currentPitch = 0;
    let currentRoll = 0;

    const resolveCustomById = (id: AnyNextoEmoteId): RobotEmote | null => {
      if (!isCustomEmoteId(id)) return null;
      return getCustomNextoEmotes().find((c) => c.id === id) || null;
    };

    const tick = () => {
      if (disposed || !renderer) return;

      const delta = Math.min(clock.getDelta(), 0.05);
      elapsed += delta;

      // 1. Natural eye blink state machine
      if (blinkStartAt < 0 && elapsed >= nextBlinkAt && riggedParts) {
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
            pendingDoubleBlink = Math.random() < 0.22;
            nextBlinkAt = elapsed + 2.4 + Math.random() * 2.2;
          }
        } else {
          blinkClose =
            progress < 0.42
              ? Math.sin((progress / 0.42) * (Math.PI / 2))
              : Math.cos(((progress - 0.42) / 0.58) * (Math.PI / 2));
        }
      }

      // 2. Emote evaluation (looped preview custom RobotEmote OR triggered/idle 100+ emotes)
      const targetLook = lookTargetRef.current;
      const previewEmote = activeEmoteRef.current;
      let pose: NextoPose | null = null;

      if (previewEmote && loopEmoteRef.current && loadedModelRoot) {
        const dur = Math.max(0.4, previewEmote.duration || 1.3);
        const p = (elapsed % dur) / dur;
        pose = evaluateCustomRobotEmote(previewEmote, p);
      } else if (previewEmote && loadedModelRoot) {
        if (emoteStartAt < 0) emoteStartAt = elapsed;
        const dur = Math.max(0.4, previewEmote.duration || 1.3);
        const p = (elapsed - emoteStartAt) / dur;
        if (p < 1) {
          pose = evaluateCustomRobotEmote(previewEmote, p);
        } else {
          emoteStartAt = -1;
        }
      } else {
        if (emoteEnabledRef.current && emoteStartAt < 0 && loadedModelRoot && elapsed >= nextEmoteAt) {
          if (!targetLook) {
            runningEmoteId = emoteRef.current;
            emoteStartAt = elapsed;
          } else {
            nextEmoteAt = elapsed + 2.5;
          }
        }

        if (emoteStartAt >= 0 && emoteEnabledRef.current) {
          const customObj = resolveCustomById(runningEmoteId);
          if (customObj) {
            const dur = Math.max(0.4, customObj.duration || 1.3);
            const p = (elapsed - emoteStartAt) / dur;
            if (p >= 1) {
              emoteStartAt = -1;
              nextEmoteAt = elapsed + 8.5 + Math.random() * 5.0;
            } else {
              pose = evaluateCustomRobotEmote(customObj, p);
            }
          } else if (isBuiltinNextoEmote(runningEmoteId)) {
            const meta = NEXTO_EMOTES.find((m) => m.id === runningEmoteId) || NEXTO_EMOTES[0];
            const p = (elapsed - emoteStartAt) / meta.duration;
            if (p >= 1) {
              emoteStartAt = -1;
              nextEmoteAt = elapsed + 8.5 + Math.random() * 5.0;
            } else {
              pose = evaluateNextoEmote(runningEmoteId, p);
            }
          } else {
            const fallbackMeta = NEXTO_EMOTES[0];
            const p = (elapsed - emoteStartAt) / fallbackMeta.duration;
            if (p >= 1) {
              emoteStartAt = -1;
              nextEmoteAt = elapsed + 8.5 + Math.random() * 5.0;
            } else {
              pose = evaluateNextoEmote(fallbackMeta.id, p);
            }
          }
        }
      }

      // 3. Apply articulated joint poses via smooth THREE.MathUtils.damp
      if (riggedParts) {
        const idleOn = animationsEnabledRef.current;
        let targetHeadRotX = idleOn ? Math.sin(elapsed * 1.7) * 0.03 : 0;
        let targetHeadRotY = idleOn ? Math.sin(elapsed * 1.15) * 0.06 : 0;
        let targetHeadRotZ = 0;

        let targetLeftArmX = 0;
        let targetLeftArmY = 0;
        let targetLeftArmZ = idleOn ? -Math.abs(Math.sin(elapsed * 2.15) * 0.04) : 0;

        let targetRightArmX = 0;
        let targetRightArmY = 0;
        let targetRightArmZ = idleOn ? Math.abs(Math.sin(elapsed * 2.15) * 0.04) : 0;

        let targetLeftAntX = 0;
        let targetLeftAntZ = idleOn ? Math.sin(elapsed * 2.2) * 0.04 : 0;
        let targetRightAntX = 0;
        let targetRightAntZ = idleOn ? -Math.sin(elapsed * 2.2) * 0.04 : 0;

        let targetMouthX = 1;
        let targetMouthY = 1;
        let targetCheekScale = 1;

        let targetLeftEyeX = 1;
        let targetLeftEyeY = 1;
        let targetRightEyeX = 1;
        let targetRightEyeY = 1;

        if (targetLook) {
          targetHeadRotY = THREE.MathUtils.clamp(targetLook.x * 0.28, -0.28, 0.28);
          targetHeadRotX = THREE.MathUtils.clamp(targetLook.y * 0.16, -0.16, 0.16);
        }

        // Optional voice state reactivity (listening / speaking)
        const vState = voiceStateRef.current;
        if (!pose && vState === 'listening') {
          targetHeadRotZ = -0.28;
          targetHeadRotY = 0.38;
          targetRightArmZ = 1.48;
          targetRightArmX = -0.68;
          targetRightAntZ = -0.22;
        } else if (!pose && vState === 'speaking') {
          const voiceNorm = THREE.MathUtils.clamp(audioLevelRef.current / 100, 0, 1);
          const speakAmt = Math.min(1, voiceNorm + Math.abs(Math.sin(elapsed * 13)) * 0.35);
          targetMouthY = 0.78 + speakAmt * 0.65;
          targetLeftArmZ = -0.25 - speakAmt * 0.25;
          targetRightArmZ = 0.25 + speakAmt * 0.25;
          targetHeadRotX = Math.sin(elapsed * 6) * 0.06;
        }

        if (pose) {
          targetHeadRotX += pose.headRotX;
          targetHeadRotY += pose.headRotY;
          targetHeadRotZ += pose.headRotZ;

          targetLeftArmX = pose.leftArmRotX;
          targetLeftArmY = pose.leftArmRotY;
          targetLeftArmZ = pose.leftArmRotZ;

          targetRightArmX = pose.rightArmRotX;
          targetRightArmY = pose.rightArmRotY;
          targetRightArmZ = pose.rightArmRotZ;

          targetLeftAntX = pose.leftEarRotX;
          targetLeftAntZ += pose.leftEarRotZ;
          targetRightAntX = pose.rightEarRotX;
          targetRightAntZ += pose.rightEarRotZ;

          targetMouthX = THREE.MathUtils.clamp(pose.mouthScaleX, 0.85, 1.15);
          targetMouthY = THREE.MathUtils.clamp(pose.mouthScaleY, 0.8, 1.55);
          targetCheekScale = THREE.MathUtils.clamp(pose.cheekScale, 0.95, 1.12);

          targetLeftEyeX = pose.leftEyeScaleX;
          targetLeftEyeY = pose.leftEyeScaleY;
          targetRightEyeX = pose.rightEyeScaleX;
          targetRightEyeY = pose.rightEyeScaleY;
        }

        // Apply idle blink smoothly on top of expression scale (z stays fixed at 1 inside headGroup!)
        const blinkFactor = 1 - 0.9 * blinkClose;
        targetLeftEyeY *= blinkFactor;
        targetRightEyeY *= blinkFactor;
        targetLeftEyeX *= 1 + 0.06 * blinkClose;
        targetRightEyeX *= 1 + 0.06 * blinkClose;

        const dampSpeed = pose ? 18 : 11;
        riggedParts.headGroup.rotation.x = THREE.MathUtils.damp(riggedParts.headGroup.rotation.x, targetHeadRotX, dampSpeed, delta);
        riggedParts.headGroup.rotation.y = THREE.MathUtils.damp(riggedParts.headGroup.rotation.y, targetHeadRotY, dampSpeed, delta);
        riggedParts.headGroup.rotation.z = THREE.MathUtils.damp(riggedParts.headGroup.rotation.z, targetHeadRotZ, dampSpeed, delta);

        riggedParts.leftArmGroup.rotation.x = THREE.MathUtils.damp(riggedParts.leftArmGroup.rotation.x, targetLeftArmX, dampSpeed, delta);
        riggedParts.leftArmGroup.rotation.y = THREE.MathUtils.damp(riggedParts.leftArmGroup.rotation.y, targetLeftArmY, dampSpeed, delta);
        riggedParts.leftArmGroup.rotation.z = THREE.MathUtils.damp(riggedParts.leftArmGroup.rotation.z, targetLeftArmZ, dampSpeed, delta);

        riggedParts.rightArmGroup.rotation.x = THREE.MathUtils.damp(riggedParts.rightArmGroup.rotation.x, targetRightArmX, dampSpeed, delta);
        riggedParts.rightArmGroup.rotation.y = THREE.MathUtils.damp(riggedParts.rightArmGroup.rotation.y, targetRightArmY, dampSpeed, delta);
        riggedParts.rightArmGroup.rotation.z = THREE.MathUtils.damp(riggedParts.rightArmGroup.rotation.z, targetRightArmZ, dampSpeed, delta);

        riggedParts.leftAntennaGroup.rotation.x = THREE.MathUtils.damp(riggedParts.leftAntennaGroup.rotation.x, targetLeftAntX, dampSpeed, delta);
        riggedParts.leftAntennaGroup.rotation.z = THREE.MathUtils.damp(riggedParts.leftAntennaGroup.rotation.z, targetLeftAntZ, dampSpeed, delta);
        riggedParts.rightAntennaGroup.rotation.x = THREE.MathUtils.damp(riggedParts.rightAntennaGroup.rotation.x, targetRightAntX, dampSpeed, delta);
        riggedParts.rightAntennaGroup.rotation.z = THREE.MathUtils.damp(riggedParts.rightAntennaGroup.rotation.z, targetRightAntZ, dampSpeed, delta);

        riggedParts.mouthGroup.scale.x = THREE.MathUtils.damp(riggedParts.mouthGroup.scale.x, targetMouthX, 20, delta);
        riggedParts.mouthGroup.scale.y = THREE.MathUtils.damp(riggedParts.mouthGroup.scale.y, targetMouthY, 20, delta);

        riggedParts.leftCheekGroup.scale.x = THREE.MathUtils.damp(riggedParts.leftCheekGroup.scale.x, targetCheekScale, 14, delta);
        riggedParts.leftCheekGroup.scale.y = THREE.MathUtils.damp(riggedParts.leftCheekGroup.scale.y, targetCheekScale, 14, delta);
        riggedParts.rightCheekGroup.scale.x = THREE.MathUtils.damp(riggedParts.rightCheekGroup.scale.x, targetCheekScale, 14, delta);
        riggedParts.rightCheekGroup.scale.y = THREE.MathUtils.damp(riggedParts.rightCheekGroup.scale.y, targetCheekScale, 14, delta);

        // Eyes stay glued in their face sockets: scale.z locked to 1, position unchanged
        riggedParts.leftEyeGroup.scale.x = THREE.MathUtils.damp(riggedParts.leftEyeGroup.scale.x, targetLeftEyeX, 24, delta);
        riggedParts.leftEyeGroup.scale.y = THREE.MathUtils.damp(riggedParts.leftEyeGroup.scale.y, targetLeftEyeY, 24, delta);
        riggedParts.rightEyeGroup.scale.x = THREE.MathUtils.damp(riggedParts.rightEyeGroup.scale.x, targetRightEyeX, 24, delta);
        riggedParts.rightEyeGroup.scale.y = THREE.MathUtils.damp(riggedParts.rightEyeGroup.scale.y, targetRightEyeY, 24, delta);
      }

      // 4. Whole-body floating + look damping combined with active emote
      if (animationsEnabledRef.current) {
        const idleYaw = Math.sin(elapsed * 0.95) * 0.08;
        const idlePitch = Math.sin(elapsed * 1.45) * 0.025;
        const idleRoll = Math.sin(elapsed * 0.8) * 0.02;

        const targetYaw = targetLook ? THREE.MathUtils.clamp(targetLook.x * 0.24, -0.24, 0.24) : idleYaw;
        const targetPitch = targetLook ? THREE.MathUtils.clamp(targetLook.y * 0.12, -0.12, 0.12) : idlePitch;
        const targetRoll = targetLook ? THREE.MathUtils.clamp(-targetLook.x * 0.06, -0.06, 0.06) : idleRoll;

        currentYaw = THREE.MathUtils.damp(currentYaw, targetYaw, 6, delta);
        currentPitch = THREE.MathUtils.damp(currentPitch, targetPitch, 6, delta);
        currentRoll = THREE.MathUtils.damp(currentRoll, targetRoll, 6, delta);

        modelPivot.rotation.set(
          currentPitch + (pose ? pose.bodyRotX : 0),
          currentYaw + (pose ? pose.bodyRotY : 0),
          currentRoll + (pose ? pose.bodyRotZ : 0)
        );
        modelPivot.position.set(
          pose ? pose.bodyPosX : 0,
          Math.sin(elapsed * 2.15) * 0.05 + (pose ? pose.bodyPosY : 0),
          pose ? pose.bodyPosZ : 0
        );
        modelPivot.scale.set(
          pose ? pose.bodyScaleX : 1,
          pose ? pose.bodyScaleY : 1,
          pose ? pose.bodyScaleZ : 1
        );
      } else {
        currentYaw = THREE.MathUtils.damp(currentYaw, 0, 8, delta);
        currentPitch = THREE.MathUtils.damp(currentPitch, 0, 8, delta);
        currentRoll = THREE.MathUtils.damp(currentRoll, 0, 8, delta);
        modelPivot.rotation.set(
          currentPitch + (pose ? pose.bodyRotX : 0),
          currentYaw + (pose ? pose.bodyRotY : 0),
          currentRoll + (pose ? pose.bodyRotZ : 0)
        );
        modelPivot.position.set(
          pose ? pose.bodyPosX : 0,
          pose ? pose.bodyPosY : 0,
          pose ? pose.bodyPosZ : 0
        );
        modelPivot.scale.set(
          pose ? pose.bodyScaleX : 1,
          pose ? pose.bodyScaleY : 1,
          pose ? pose.bodyScaleZ : 1
        );
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

      if (lightingRig) {
        lightingRig.envRenderTarget.dispose();
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

  return (
    <div
      style={{ width: size, height: size }}
      className="relative cursor-pointer active:cursor-grabbing select-none drop-shadow-[0_10px_18px_rgba(24,119,242,0.28)]"
      aria-label="Nexto 3D Robot"
    >
      {!isModelReady && posterUrl && (
        <img
          src={posterUrl}
          alt="Nexto 3D Robot"
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
        />
      )}
      <div
        ref={containerRef}
        style={{ width: size, height: size }}
        className={`w-full h-full transition-opacity duration-150 pointer-events-none select-none ${
          isModelReady ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
};

export default NextoRobot3D;
