import { FaceLandmarkPoint, FilterSettings, FilterId } from './types';
import { LANDMARKS, getPoint, getDistance, getHeadRoll, getMouthOpenness } from './landmarks';

// Helper to convert hex color to rgba
export function hexToRgba(hex: string, alpha: number): string {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('');
  }
  const num = parseInt(c, 16);
  if (isNaN(num)) return `rgba(255, 0, 128, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

// Draw smooth path through landmark indices
function drawSmoothPath(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  indices: number[],
  width: number,
  height: number,
  closePath: boolean = false
) {
  if (indices.length < 2) return;
  const first = getPoint(landmarks[indices[0]], width, height);
  ctx.moveTo(first[0], first[1]);

  for (let i = 1; i < indices.length; i++) {
    const p = getPoint(landmarks[indices[i]], width, height);
    if (i < indices.length - 1) {
      const next = getPoint(landmarks[indices[i + 1]], width, height);
      const midX = (p[0] + next[0]) / 2;
      const midY = (p[1] + next[1]) / 2;
      ctx.quadraticCurveTo(p[0], p[1], midX, midY);
    } else {
      ctx.lineTo(p[0], p[1]);
    }
  }

  if (closePath) {
    ctx.closePath();
  }
}

// ----------------------------------------------------
// 1. MAKEUP RENDERERS (Internal Canvas 2D)
// ----------------------------------------------------

export function renderLipstick(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  settings: FilterSettings,
  width: number,
  height: number
) {
  const intensity = (settings.intensity / 100);
  const opacity = (settings.opacity / 100) * 0.85 * intensity;
  if (opacity <= 0.01) return;

  const color = hexToRgba(settings.color, opacity);
  const lipBlur = Math.max(0, settings.blur);

  ctx.save();
  ctx.filter = lipBlur > 0 ? `blur(${lipBlur}px)` : 'none';
  ctx.fillStyle = color;
  ctx.globalCompositeOperation = settings.blendMode || 'multiply';

  // Upper Lip Polygon
  ctx.beginPath();
  drawSmoothPath(ctx, landmarks, LANDMARKS.upperLipOuter, width, height, false);
  // Inner reverse
  const upperInner = [...LANDMARKS.upperLipInner].reverse();
  for (let idx of upperInner) {
    const p = getPoint(landmarks[idx], width, height);
    ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();
  ctx.fill();

  // Lower Lip Polygon
  ctx.beginPath();
  drawSmoothPath(ctx, landmarks, LANDMARKS.lowerLipOuter, width, height, false);
  // Inner reverse
  const lowerInner = [...LANDMARKS.lowerLipInner].reverse();
  for (let idx of lowerInner) {
    const p = getPoint(landmarks[idx], width, height);
    ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();
  ctx.fill();

  // Subtle natural lip shine/gloss highlight
  if (intensity > 0.4) {
    const centerBot = getPoint(landmarks[LANDMARKS.lipCenterBottom], width, height);
    const grad = ctx.createRadialGradient(
      centerBot[0], centerBot[1] - 4, 1,
      centerBot[0], centerBot[1] - 4, 14
    );
    grad.addColorStop(0, `rgba(255, 255, 255, ${0.4 * intensity})`);
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(centerBot[0], centerBot[1] - 3, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function renderBlush(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  settings: FilterSettings,
  width: number,
  height: number
) {
  const intensity = (settings.intensity / 100);
  const opacity = (settings.opacity / 100) * 0.65 * intensity;
  if (opacity <= 0.01) return;

  const leftCheek = getPoint(landmarks[LANDMARKS.leftCheekCenter], width, height);
  const rightCheek = getPoint(landmarks[LANDMARKS.rightCheekCenter], width, height);

  const leftEye = landmarks[LANDMARKS.leftEyeOuterCorner];
  const rightEye = landmarks[LANDMARKS.rightEyeOuterCorner];
  const eyeDist = getDistance(leftEye, rightEye, width, height);
  const radius = Math.max(15, eyeDist * 0.35);

  ctx.save();
  ctx.globalCompositeOperation = settings.blendMode || 'multiply';
  const blurVal = Math.max(6, settings.blur * 1.5);
  ctx.filter = `blur(${blurVal}px)`;

  // Left Cheek Blush
  const leftGrad = ctx.createRadialGradient(leftCheek[0], leftCheek[1], 2, leftCheek[0], leftCheek[1], radius);
  leftGrad.addColorStop(0, hexToRgba(settings.color, opacity));
  leftGrad.addColorStop(0.6, hexToRgba(settings.color, opacity * 0.4));
  leftGrad.addColorStop(1, hexToRgba(settings.color, 0));

  ctx.fillStyle = leftGrad;
  ctx.beginPath();
  ctx.ellipse(leftCheek[0], leftCheek[1], radius * 1.2, radius * 0.8, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // Right Cheek Blush
  const rightGrad = ctx.createRadialGradient(rightCheek[0], rightCheek[1], 2, rightCheek[0], rightCheek[1], radius);
  rightGrad.addColorStop(0, hexToRgba(settings.color, opacity));
  rightGrad.addColorStop(0.6, hexToRgba(settings.color, opacity * 0.4));
  rightGrad.addColorStop(1, hexToRgba(settings.color, 0));

  ctx.fillStyle = rightGrad;
  ctx.beginPath();
  ctx.ellipse(rightCheek[0], rightCheek[1], radius * 1.2, radius * 0.8, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function renderEyeliner(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  settings: FilterSettings,
  width: number,
  height: number
) {
  const intensity = (settings.intensity / 100);
  const opacity = (settings.opacity / 100) * intensity;
  if (opacity <= 0.01) return;

  const leftEye = landmarks[LANDMARKS.leftEyeOuterCorner];
  const rightEye = landmarks[LANDMARKS.rightEyeOuterCorner];
  const eyeDist = getDistance(leftEye, rightEye, width, height);
  const lineWidth = Math.max(2, (eyeDist * 0.025) * intensity);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = hexToRgba(settings.color, opacity);
  ctx.lineWidth = lineWidth;
  ctx.filter = settings.blur > 0 ? `blur(${settings.blur}px)` : 'none';

  // Left Eye Lashline & Wing
  ctx.beginPath();
  drawSmoothPath(ctx, landmarks, LANDMARKS.leftEyeUpperLash, width, height, false);
  const leftOuter = getPoint(landmarks[LANDMARKS.leftEyeOuterCorner], width, height);
  const leftWing = [leftOuter[0] - eyeDist * 0.12, leftOuter[1] - eyeDist * 0.04];
  ctx.lineTo(leftWing[0], leftWing[1]);
  ctx.stroke();

  // Right Eye Lashline & Wing
  ctx.beginPath();
  drawSmoothPath(ctx, landmarks, LANDMARKS.rightEyeUpperLash, width, height, false);
  const rightOuter = getPoint(landmarks[LANDMARKS.rightEyeOuterCorner], width, height);
  const rightWing = [rightOuter[0] + eyeDist * 0.12, rightOuter[1] - eyeDist * 0.04];
  ctx.lineTo(rightWing[0], rightWing[1]);
  ctx.stroke();

  ctx.restore();
}

export function renderEyeshadow(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  settings: FilterSettings,
  width: number,
  height: number
) {
  const intensity = (settings.intensity / 100);
  const opacity = (settings.opacity / 100) * 0.65 * intensity;
  if (opacity <= 0.01) return;

  ctx.save();
  ctx.globalCompositeOperation = settings.blendMode || 'multiply';
  const blurVal = Math.max(4, settings.blur);
  ctx.filter = `blur(${blurVal}px)`;
  ctx.fillStyle = hexToRgba(settings.color, opacity);

  // Left eyelid area
  ctx.beginPath();
  drawSmoothPath(ctx, landmarks, LANDMARKS.leftEyeUpperLash, width, height, false);
  const leftCrease = [...LANDMARKS.leftEyeCrease].reverse();
  for (let idx of leftCrease) {
    const p = getPoint(landmarks[idx], width, height);
    ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();
  ctx.fill();

  // Right eyelid area
  ctx.beginPath();
  drawSmoothPath(ctx, landmarks, LANDMARKS.rightEyeUpperLash, width, height, false);
  const rightCrease = [...LANDMARKS.rightEyeCrease].reverse();
  for (let idx of rightCrease) {
    const p = getPoint(landmarks[idx], width, height);
    ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

export function renderBeautySmooth(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  settings: FilterSettings,
  width: number,
  height: number,
  sourceCanvasOrVideo: HTMLCanvasElement | HTMLVideoElement
) {
  const intensity = (settings.intensity / 100);
  const opacity = (settings.opacity / 100) * 0.7 * intensity;
  if (opacity <= 0.01) return;

  ctx.save();
  // Clip to Face Oval to keep background, hair, and clothing crisp
  ctx.beginPath();
  drawSmoothPath(ctx, landmarks, LANDMARKS.faceOval, width, height, true);
  ctx.clip();

  // Soft porcelain glow fill
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = hexToRgba(settings.color, opacity * 0.7);
  ctx.fillRect(0, 0, width, height);

  // Subtle skin softening bilateral blur layer
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = `rgba(255, 255, 255, ${0.15 * intensity})`;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();
}

// ----------------------------------------------------
// 2. EFFECT RENDERERS (Overlays, Face Features & Masks)
// ----------------------------------------------------

export function renderCatFace(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  settings: FilterSettings,
  width: number,
  height: number
) {
  const intensity = (settings.intensity / 100);
  const opacity = (settings.opacity / 100) * intensity;
  if (opacity <= 0.01) return;

  const roll = getHeadRoll(landmarks, width, height);
  const forehead = getPoint(landmarks[LANDMARKS.foreheadCenter], width, height);
  const leftEye = landmarks[LANDMARKS.leftEyeOuterCorner];
  const rightEye = landmarks[LANDMARKS.rightEyeOuterCorner];
  const eyeDist = getDistance(leftEye, rightEye, width, height);
  const earSize = eyeDist * 1.35;

  ctx.save();
  ctx.translate(forehead[0], forehead[1]);
  ctx.rotate(roll);

  // Left Cat Ear
  const leftEarX = -eyeDist * 0.85;
  const leftEarY = -earSize * 0.85;
  ctx.save();
  ctx.translate(leftEarX, leftEarY);
  ctx.rotate(-0.25);

  // Outer ear
  ctx.beginPath();
  ctx.moveTo(-earSize * 0.45, earSize * 0.4);
  ctx.quadraticCurveTo(-earSize * 0.4, -earSize * 0.6, 0, -earSize * 0.7);
  ctx.quadraticCurveTo(earSize * 0.4, -earSize * 0.4, earSize * 0.45, earSize * 0.4);
  ctx.closePath();
  ctx.fillStyle = '#222222';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Inner ear pink fluff
  ctx.beginPath();
  ctx.moveTo(-earSize * 0.25, earSize * 0.25);
  ctx.quadraticCurveTo(-earSize * 0.2, -earSize * 0.4, 0, -earSize * 0.55);
  ctx.quadraticCurveTo(earSize * 0.2, -earSize * 0.25, earSize * 0.25, earSize * 0.25);
  ctx.closePath();
  ctx.fillStyle = hexToRgba(settings.color, opacity);
  ctx.fill();
  ctx.restore();

  // Right Cat Ear
  const rightEarX = eyeDist * 0.85;
  const rightEarY = -earSize * 0.85;
  ctx.save();
  ctx.translate(rightEarX, rightEarY);
  ctx.rotate(0.25);

  ctx.beginPath();
  ctx.moveTo(-earSize * 0.45, earSize * 0.4);
  ctx.quadraticCurveTo(-earSize * 0.4, -earSize * 0.4, 0, -earSize * 0.7);
  ctx.quadraticCurveTo(earSize * 0.4, -earSize * 0.6, earSize * 0.45, earSize * 0.4);
  ctx.closePath();
  ctx.fillStyle = '#222222';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-earSize * 0.25, earSize * 0.25);
  ctx.quadraticCurveTo(-earSize * 0.2, -earSize * 0.25, 0, -earSize * 0.55);
  ctx.quadraticCurveTo(earSize * 0.2, -earSize * 0.4, earSize * 0.25, earSize * 0.25);
  ctx.closePath();
  ctx.fillStyle = hexToRgba(settings.color, opacity);
  ctx.fill();
  ctx.restore();

  ctx.restore(); // Exit forehead transform

  // Nose tip: Pink heart / cute triangle
  const nose = getPoint(landmarks[LANDMARKS.noseTip], width, height);
  const noseRadius = eyeDist * 0.12;

  ctx.save();
  ctx.translate(nose[0], nose[1]);
  ctx.rotate(roll);
  ctx.beginPath();
  ctx.moveTo(-noseRadius, -noseRadius * 0.5);
  ctx.lineTo(noseRadius, -noseRadius * 0.5);
  ctx.quadraticCurveTo(0, noseRadius * 1.1, -noseRadius, -noseRadius * 0.5);
  ctx.fillStyle = hexToRgba(settings.color, opacity);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.restore();

  // Whiskers on both cheeks
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.9})`;

  const leftWhiskOrigin = [nose[0] - eyeDist * 0.25, nose[1] + eyeDist * 0.05];
  const rightWhiskOrigin = [nose[0] + eyeDist * 0.25, nose[1] + eyeDist * 0.05];
  const whiskLen = eyeDist * 0.6;

  // Left Whiskers (3)
  for (let angle of [-0.15, 0, 0.15]) {
    const a = roll + Math.PI + angle;
    ctx.beginPath();
    ctx.moveTo(leftWhiskOrigin[0], leftWhiskOrigin[1]);
    ctx.lineTo(leftWhiskOrigin[0] + Math.cos(a) * whiskLen, leftWhiskOrigin[1] + Math.sin(a) * whiskLen);
    ctx.stroke();
  }

  // Right Whiskers (3)
  for (let angle of [-0.15, 0, 0.15]) {
    const a = roll + angle;
    ctx.beginPath();
    ctx.moveTo(rightWhiskOrigin[0], rightWhiskOrigin[1]);
    ctx.lineTo(rightWhiskOrigin[0] + Math.cos(a) * whiskLen, rightWhiskOrigin[1] + Math.sin(a) * whiskLen);
    ctx.stroke();
  }

  ctx.restore();
}

export function renderSunglasses(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  settings: FilterSettings,
  width: number,
  height: number
) {
  const intensity = (settings.intensity / 100);
  const opacity = (settings.opacity / 100) * intensity;
  if (opacity <= 0.01) return;

  const roll = getHeadRoll(landmarks, width, height);
  const bridge = getPoint(landmarks[LANDMARKS.noseBridge], width, height);
  const leftEye = landmarks[LANDMARKS.leftEyeOuterCorner];
  const rightEye = landmarks[LANDMARKS.rightEyeOuterCorner];
  const eyeDist = getDistance(leftEye, rightEye, width, height);

  const glassWidth = eyeDist * 1.6;
  const glassHeight = eyeDist * 0.65;
  const lensRadius = glassHeight * 0.45;

  ctx.save();
  ctx.translate(bridge[0], bridge[1]);
  ctx.rotate(roll);

  // Sunglasses Bridge
  ctx.lineWidth = 4;
  ctx.strokeStyle = settings.color2 || '#ffd166';
  ctx.beginPath();
  ctx.moveTo(-eyeDist * 0.2, -glassHeight * 0.1);
  ctx.quadraticCurveTo(0, -glassHeight * 0.25, eyeDist * 0.2, -glassHeight * 0.1);
  ctx.stroke();

  // Left Lens
  const leftLensCenter = [-eyeDist * 0.52, glassHeight * 0.05];
  ctx.save();
  ctx.translate(leftLensCenter[0], leftLensCenter[1]);

  // Frame outline
  ctx.beginPath();
  ctx.roundRect(-glassWidth * 0.24, -glassHeight * 0.48, glassWidth * 0.48, glassHeight * 0.96, [lensRadius, lensRadius, lensRadius * 1.2, lensRadius * 1.2]);
  ctx.fillStyle = hexToRgba(settings.color, opacity);
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = settings.color2 || '#ffd166';
  ctx.stroke();

  // Glass Reflection Glare
  const glareGrad = ctx.createLinearGradient(-30, -30, 30, 30);
  glareGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
  glareGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.05)');
  glareGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glareGrad;
  ctx.fill();
  ctx.restore();

  // Right Lens
  const rightLensCenter = [eyeDist * 0.52, glassHeight * 0.05];
  ctx.save();
  ctx.translate(rightLensCenter[0], rightLensCenter[1]);

  ctx.beginPath();
  ctx.roundRect(-glassWidth * 0.24, -glassHeight * 0.48, glassWidth * 0.48, glassHeight * 0.96, [lensRadius, lensRadius, lensRadius * 1.2, lensRadius * 1.2]);
  ctx.fillStyle = hexToRgba(settings.color, opacity);
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = settings.color2 || '#ffd166';
  ctx.stroke();

  ctx.fillStyle = glareGrad;
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

export function renderDogFace(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  settings: FilterSettings,
  width: number,
  height: number
) {
  const intensity = (settings.intensity / 100);
  const opacity = (settings.opacity / 100) * intensity;
  if (opacity <= 0.01) return;

  const roll = getHeadRoll(landmarks, width, height);
  const forehead = getPoint(landmarks[LANDMARKS.foreheadCenter], width, height);
  const nose = getPoint(landmarks[LANDMARKS.noseTip], width, height);
  const leftEye = landmarks[LANDMARKS.leftEyeOuterCorner];
  const rightEye = landmarks[LANDMARKS.rightEyeOuterCorner];
  const eyeDist = getDistance(leftEye, rightEye, width, height);
  const earLen = eyeDist * 1.4;

  ctx.save();
  ctx.translate(forehead[0], forehead[1]);
  ctx.rotate(roll);

  // Left Floppy Dog Ear
  ctx.save();
  ctx.translate(-eyeDist * 0.9, -earLen * 0.1);
  ctx.rotate(0.1);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-earLen * 0.4, earLen * 0.3, -earLen * 0.5, earLen * 0.8, -earLen * 0.1, earLen);
  ctx.bezierCurveTo(earLen * 0.2, earLen * 0.8, earLen * 0.2, earLen * 0.3, 0, 0);
  ctx.fillStyle = settings.color || '#c97a3e';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#5c3818';
  ctx.stroke();
  ctx.restore();

  // Right Floppy Dog Ear
  ctx.save();
  ctx.translate(eyeDist * 0.9, -earLen * 0.1);
  ctx.rotate(-0.1);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(earLen * 0.4, earLen * 0.3, earLen * 0.5, earLen * 0.8, earLen * 0.1, earLen);
  ctx.bezierCurveTo(-earLen * 0.2, earLen * 0.8, -earLen * 0.2, earLen * 0.3, 0, 0);
  ctx.fillStyle = settings.color || '#c97a3e';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#5c3818';
  ctx.stroke();
  ctx.restore();

  ctx.restore(); // Exit forehead

  // Big Cute Dog Button Nose
  ctx.save();
  ctx.translate(nose[0], nose[1]);
  ctx.rotate(roll);
  ctx.beginPath();
  ctx.ellipse(0, 0, eyeDist * 0.22, eyeDist * 0.16, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1c1917';
  ctx.fill();

  // Nose highlight shine
  ctx.beginPath();
  ctx.ellipse(-eyeDist * 0.06, -eyeDist * 0.05, eyeDist * 0.06, eyeDist * 0.035, -0.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fill();
  ctx.restore();

  // Interactive Open Mouth -> Extended Dog Tongue!
  const mouthOpen = getMouthOpenness(landmarks, width, height);
  if (mouthOpen > 0.15) {
    const mouthCenter = getPoint(landmarks[LANDMARKS.mouthLowerInner], width, height);
    const tongueProgress = Math.min(1.0, (mouthOpen - 0.15) * 4);
    const tongueLength = eyeDist * 0.9 * tongueProgress;
    const tongueWidth = eyeDist * 0.35;

    ctx.save();
    ctx.translate(mouthCenter[0], mouthCenter[1]);
    ctx.rotate(roll);

    ctx.beginPath();
    ctx.moveTo(-tongueWidth * 0.5, 0);
    ctx.bezierCurveTo(-tongueWidth * 0.6, tongueLength * 0.6, -tongueWidth * 0.4, tongueLength, 0, tongueLength);
    ctx.bezierCurveTo(tongueWidth * 0.4, tongueLength, tongueWidth * 0.6, tongueLength * 0.6, tongueWidth * 0.5, 0);
    ctx.closePath();
    ctx.fillStyle = '#ff6b81';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#c92a2a';
    ctx.stroke();

    // Center tongue indentation line
    ctx.beginPath();
    ctx.moveTo(0, tongueLength * 0.2);
    ctx.lineTo(0, tongueLength * 0.8);
    ctx.strokeStyle = '#c92a2a';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }
}

export function renderFlowerCrown(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  settings: FilterSettings,
  width: number,
  height: number
) {
  const intensity = (settings.intensity / 100);
  const opacity = (settings.opacity / 100) * intensity;
  if (opacity <= 0.01) return;

  const roll = getHeadRoll(landmarks, width, height);
  const forehead = getPoint(landmarks[LANDMARKS.foreheadCenter], width, height);
  const leftEye = landmarks[LANDMARKS.leftEyeOuterCorner];
  const rightEye = landmarks[LANDMARKS.rightEyeOuterCorner];
  const eyeDist = getDistance(leftEye, rightEye, width, height);

  ctx.save();
  ctx.translate(forehead[0], forehead[1] - eyeDist * 0.25);
  ctx.rotate(roll);

  const crownWidth = eyeDist * 1.8;
  const numFlowers = 7;
  const flowerRadius = eyeDist * 0.16;

  // Arc of flowers across head
  for (let i = 0; i < numFlowers; i++) {
    const t = (i / (numFlowers - 1)) - 0.5; // -0.5 to 0.5
    const x = t * crownWidth;
    const y = -Math.cos(t * Math.PI) * (eyeDist * 0.25);

    // Draw individual floral blossom
    ctx.save();
    ctx.translate(x, y);

    // Green leaves behind flower
    ctx.fillStyle = '#2d6a4f';
    ctx.beginPath();
    ctx.ellipse(-flowerRadius * 0.7, -flowerRadius * 0.3, flowerRadius * 0.5, flowerRadius * 0.25, 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Flower Petals (5 petals)
    const petalColor = i % 2 === 0 ? settings.color : (settings.color2 || '#ffd166');
    ctx.fillStyle = hexToRgba(petalColor, opacity);

    for (let p = 0; p < 5; p++) {
      const angle = (p * Math.PI * 2) / 5;
      const px = Math.cos(angle) * (flowerRadius * 0.6);
      const py = Math.sin(angle) * (flowerRadius * 0.6);
      ctx.beginPath();
      ctx.arc(px, py, flowerRadius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Flower Golden Center
    ctx.beginPath();
    ctx.arc(0, 0, flowerRadius * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#ffbe0b';
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();
}

export function renderCyberMask(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  settings: FilterSettings,
  width: number,
  height: number
) {
  const intensity = (settings.intensity / 100);
  const opacity = (settings.opacity / 100) * intensity;
  if (opacity <= 0.01) return;

  const neonColor = settings.color || '#00f5d4';

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.strokeStyle = hexToRgba(neonColor, opacity);
  ctx.shadowColor = neonColor;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2.5;

  // Cyber Eyewear Visor Contour
  const leftEyeOuter = getPoint(landmarks[LANDMARKS.leftEyeOuterCorner], width, height);
  const rightEyeOuter = getPoint(landmarks[LANDMARKS.rightEyeOuterCorner], width, height);
  const templeLeft = getPoint(landmarks[LANDMARKS.templeLeft], width, height);
  const templeRight = getPoint(landmarks[LANDMARKS.templeRight], width, height);
  const noseBridge = getPoint(landmarks[LANDMARKS.noseBridge], width, height);

  ctx.beginPath();
  ctx.moveTo(templeLeft[0], templeLeft[1]);
  ctx.lineTo(leftEyeOuter[0], leftEyeOuter[1] - 8);
  ctx.lineTo(noseBridge[0], noseBridge[1] - 12);
  ctx.lineTo(rightEyeOuter[0], rightEyeOuter[1] - 8);
  ctx.lineTo(templeRight[0], templeRight[1]);
  ctx.stroke();

  // Cheek circuit paths
  const leftCheek = getPoint(landmarks[LANDMARKS.leftCheekCenter], width, height);
  const rightCheek = getPoint(landmarks[LANDMARKS.rightCheekCenter], width, height);

  ctx.beginPath();
  ctx.moveTo(templeLeft[0], templeLeft[1]);
  ctx.lineTo(leftCheek[0], leftCheek[1]);
  ctx.lineTo(leftCheek[0] - 20, leftCheek[1] + 25);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(templeRight[0], templeRight[1]);
  ctx.lineTo(rightCheek[0], rightCheek[1]);
  ctx.lineTo(rightCheek[0] + 20, rightCheek[1] + 25);
  ctx.stroke();

  // Glowing micro-nodes
  ctx.fillStyle = '#ffffff';
  for (let pt of [templeLeft, templeRight, leftCheek, rightCheek, noseBridge]) {
    ctx.beginPath();
    ctx.arc(pt[0], pt[1], 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function renderGlitterStars(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  settings: FilterSettings,
  width: number,
  height: number,
  timestamp: number
) {
  const intensity = (settings.intensity / 100);
  const opacity = (settings.opacity / 100) * intensity;
  if (opacity <= 0.01) return;

  const leftCheek = getPoint(landmarks[LANDMARKS.leftCheekCenter], width, height);
  const rightCheek = getPoint(landmarks[LANDMARKS.rightCheekCenter], width, height);
  const leftEye = landmarks[LANDMARKS.leftEyeOuterCorner];
  const rightEye = landmarks[LANDMARKS.rightEyeOuterCorner];
  const eyeDist = getDistance(leftEye, rightEye, width, height);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = hexToRgba(settings.color || '#ffea00', opacity);
  ctx.shadowColor = settings.color || '#ffea00';
  ctx.shadowBlur = 8;

  const drawStar = (cx: number, cy: number, size: number, phase: number) => {
    const pulse = 0.7 + 0.3 * Math.sin(timestamp * 0.005 + phase);
    const r = size * pulse;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = hexToRgba(settings.color || '#ffea00', opacity * pulse);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  };

  // Stars under left cheek
  drawStar(leftCheek[0] - eyeDist * 0.1, leftCheek[1] - eyeDist * 0.1, eyeDist * 0.12, 0);
  drawStar(leftCheek[0] + eyeDist * 0.15, leftCheek[1], eyeDist * 0.09, 1.2);
  drawStar(leftCheek[0] - eyeDist * 0.05, leftCheek[1] + eyeDist * 0.15, eyeDist * 0.07, 2.4);

  // Stars under right cheek
  drawStar(rightCheek[0] + eyeDist * 0.1, rightCheek[1] - eyeDist * 0.1, eyeDist * 0.12, 0.6);
  drawStar(rightCheek[0] - eyeDist * 0.15, rightCheek[1], eyeDist * 0.09, 1.8);
  drawStar(rightCheek[0] + eyeDist * 0.05, rightCheek[1] + eyeDist * 0.15, eyeDist * 0.07, 3.0);

  ctx.restore();
}

export function renderGoldenMask(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  settings: FilterSettings,
  width: number,
  height: number
) {
  const intensity = (settings.intensity / 100);
  const opacity = (settings.opacity / 100) * intensity;
  if (opacity <= 0.01) return;

  const gold = settings.color || '#ffd700';
  const bridge = getPoint(landmarks[LANDMARKS.noseBridge], width, height);
  const leftEyeOuter = getPoint(landmarks[LANDMARKS.leftEyeOuterCorner], width, height);
  const rightEyeOuter = getPoint(landmarks[LANDMARKS.rightEyeOuterCorner], width, height);
  const eyeDist = getDistance(landmarks[LANDMARKS.leftEyeOuterCorner], landmarks[LANDMARKS.rightEyeOuterCorner], width, height);

  ctx.save();
  ctx.strokeStyle = hexToRgba(gold, opacity);
  ctx.fillStyle = hexToRgba(gold, opacity * 0.25);
  ctx.lineWidth = 3;

  // Mask Body spanning both eyes
  ctx.beginPath();
  ctx.moveTo(bridge[0], bridge[1] - eyeDist * 0.4);
  // Curve up over left eye
  ctx.quadraticCurveTo(leftEyeOuter[0], bridge[1] - eyeDist * 0.6, leftEyeOuter[0] - eyeDist * 0.25, leftEyeOuter[1] - eyeDist * 0.2);
  ctx.quadraticCurveTo(leftEyeOuter[0] - eyeDist * 0.35, leftEyeOuter[1] + eyeDist * 0.3, leftEyeOuter[0], leftEyeOuter[1] + eyeDist * 0.4);
  ctx.quadraticCurveTo(bridge[0] - eyeDist * 0.15, bridge[1] + eyeDist * 0.2, bridge[0], bridge[1]);
  // Curve over right eye
  ctx.quadraticCurveTo(bridge[0] + eyeDist * 0.15, bridge[1] + eyeDist * 0.2, rightEyeOuter[0], rightEyeOuter[1] + eyeDist * 0.4);
  ctx.quadraticCurveTo(rightEyeOuter[0] + eyeDist * 0.35, rightEyeOuter[1] + eyeDist * 0.3, rightEyeOuter[0] + eyeDist * 0.25, rightEyeOuter[1] - eyeDist * 0.2);
  ctx.quadraticCurveTo(rightEyeOuter[0], bridge[1] - eyeDist * 0.6, bridge[0], bridge[1] - eyeDist * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Eye Cutouts (Left Eye & Right Eye)
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  drawSmoothPath(ctx, landmarks, LANDMARKS.leftEyeUpperLash, width, height, true);
  ctx.stroke();

  ctx.beginPath();
  drawSmoothPath(ctx, landmarks, LANDMARKS.rightEyeUpperLash, width, height, true);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

export function renderBunnyEars(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  settings: FilterSettings,
  width: number,
  height: number
) {
  const intensity = (settings.intensity / 100);
  const opacity = (settings.opacity / 100) * intensity;
  if (opacity <= 0.01) return;

  const roll = getHeadRoll(landmarks, width, height);
  const forehead = getPoint(landmarks[LANDMARKS.foreheadCenter], width, height);
  const leftEye = landmarks[LANDMARKS.leftEyeOuterCorner];
  const rightEye = landmarks[LANDMARKS.rightEyeOuterCorner];
  const eyeDist = getDistance(leftEye, rightEye, width, height);
  const earLen = eyeDist * 2.0;
  const earWidth = eyeDist * 0.5;

  ctx.save();
  ctx.translate(forehead[0], forehead[1]);
  ctx.rotate(roll);

  // Left Bunny Ear
  ctx.save();
  ctx.translate(-eyeDist * 0.45, -earLen * 0.7);
  ctx.rotate(-0.08);

  ctx.beginPath();
  ctx.ellipse(0, 0, earWidth * 0.5, earLen * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();

  // Pink Inner Ear
  ctx.beginPath();
  ctx.ellipse(0, 0, earWidth * 0.28, earLen * 0.38, 0, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(settings.color || '#ffcbf2', opacity);
  ctx.fill();
  ctx.restore();

  // Right Bunny Ear
  ctx.save();
  ctx.translate(eyeDist * 0.45, -earLen * 0.7);
  ctx.rotate(0.08);

  ctx.beginPath();
  ctx.ellipse(0, 0, earWidth * 0.5, earLen * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(0, 0, earWidth * 0.28, earLen * 0.38, 0, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(settings.color || '#ffcbf2', opacity);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

// Master Dispatcher for all active filters
export function renderActiveFilters(
  ctx: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  activeFilterSettings: Record<FilterId, FilterSettings>,
  activeFilterIds: Set<FilterId>,
  width: number,
  height: number,
  timestamp: number,
  videoEl: HTMLVideoElement | HTMLCanvasElement
) {
  // 1. Beauty smooth first if active
  if (activeFilterIds.has('beauty_smooth')) {
    renderBeautySmooth(ctx, landmarks, activeFilterSettings['beauty_smooth'], width, height, videoEl);
  }

  // 2. Eyeshadow
  if (activeFilterIds.has('eyeshadow')) {
    renderEyeshadow(ctx, landmarks, activeFilterSettings['eyeshadow'], width, height);
  }

  // 3. Eyeliner
  if (activeFilterIds.has('eyeliner')) {
    renderEyeliner(ctx, landmarks, activeFilterSettings['eyeliner'], width, height);
  }

  // 4. Blush
  if (activeFilterIds.has('blush')) {
    renderBlush(ctx, landmarks, activeFilterSettings['blush'], width, height);
  }

  // 5. Lipstick
  if (activeFilterIds.has('lipstick')) {
    renderLipstick(ctx, landmarks, activeFilterSettings['lipstick'], width, height);
  }

  // 6. Effects Overlays
  if (activeFilterIds.has('cat_face')) {
    renderCatFace(ctx, landmarks, activeFilterSettings['cat_face'], width, height);
  }
  if (activeFilterIds.has('sunglasses')) {
    renderSunglasses(ctx, landmarks, activeFilterSettings['sunglasses'], width, height);
  }
  if (activeFilterIds.has('dog_face')) {
    renderDogFace(ctx, landmarks, activeFilterSettings['dog_face'], width, height);
  }
  if (activeFilterIds.has('flower_crown')) {
    renderFlowerCrown(ctx, landmarks, activeFilterSettings['flower_crown'], width, height);
  }
  if (activeFilterIds.has('cyber_mask')) {
    renderCyberMask(ctx, landmarks, activeFilterSettings['cyber_mask'], width, height);
  }
  if (activeFilterIds.has('bunny_ears')) {
    renderBunnyEars(ctx, landmarks, activeFilterSettings['bunny_ears'], width, height);
  }
  if (activeFilterIds.has('golden_mask')) {
    renderGoldenMask(ctx, landmarks, activeFilterSettings['golden_mask'], width, height);
  }
  if (activeFilterIds.has('glitter_stars')) {
    renderGlitterStars(ctx, landmarks, activeFilterSettings['glitter_stars'], width, height, timestamp);
  }
}
