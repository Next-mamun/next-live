import { FilterSettings, LandmarkPoint } from '../types';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('');
  }
  const num = parseInt(c, 16) || 0;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Compute key head orientation metrics from landmarks
 */
function getHeadTransform(landmarks: LandmarkPoint[], w: number, h: number) {
  // Left eye outer: 33, Right eye outer: 263
  const lEye = { x: landmarks[33].x * w, y: landmarks[33].y * h };
  const rEye = { x: landmarks[263].x * w, y: landmarks[263].y * h };

  const dx = rEye.x - lEye.x;
  const dy = rEye.y - lEye.y;
  const eyeDistance = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);

  const midEyes = {
    x: (lEye.x + rEye.x) / 2,
    y: (lEye.y + rEye.y) / 2,
  };

  const topHead = {
    x: landmarks[10].x * w,
    y: landmarks[10].y * h,
  };

  const noseBridge = {
    x: landmarks[6].x * w,
    y: landmarks[6].y * h,
  };

  const noseTip = {
    x: landmarks[1].x * w,
    y: landmarks[1].y * h,
  };

  const chin = {
    x: landmarks[152].x * w,
    y: landmarks[152].y * h,
  };

  const faceHeight = Math.hypot(chin.x - topHead.x, chin.y - topHead.y);

  return { eyeDistance, angle, midEyes, topHead, noseBridge, noseTip, chin, faceHeight };
}

/**
 * 1. CAT EARS & FACE: 3D-oriented feline ears, cute pink nose, and whiskers
 */
export function renderCatEarsAndFace(
  ctx: CanvasRenderingContext2D,
  landmarks: LandmarkPoint[],
  w: number,
  h: number,
  settings: FilterSettings
) {
  if (landmarks.length < 468) return;

  const { r, g, b } = hexToRgb(settings.color);
  const alpha = (settings.opacity / 100) * (settings.intensity / 100);
  if (alpha <= 0) return;

  const { eyeDistance, angle, topHead, noseTip } = getHeadTransform(landmarks, w, h);
  const earSize = eyeDistance * 0.72;

  ctx.save();
  ctx.filter = settings.blur > 0 ? `blur(${settings.blur * 0.3}px)` : 'none';

  // --- EARS (Rendered in head-aligned local coordinate frame) ---
  ctx.save();
  ctx.translate(topHead.x, topHead.y);
  ctx.rotate(angle);

  // Left Ear
  ctx.save();
  ctx.translate(-earSize * 0.9, -earSize * 0.45);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-earSize * 0.4, -earSize * 1.1, -earSize * 0.1, -earSize * 1.35);
  ctx.quadraticCurveTo(earSize * 0.6, -earSize * 0.9, earSize * 0.7, 0);
  ctx.closePath();

  // Ear base gradient
  const leftEarGrad = ctx.createLinearGradient(-earSize * 0.4, -earSize * 1.35, earSize * 0.7, 0);
  leftEarGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
  leftEarGrad.addColorStop(1, `rgba(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)}, ${alpha * 0.85})`);
  ctx.fillStyle = leftEarGrad;
  ctx.fill();

  // Inner ear pink fluff
  ctx.beginPath();
  ctx.moveTo(earSize * 0.1, -earSize * 0.15);
  ctx.quadraticCurveTo(-earSize * 0.2, -earSize * 0.85, 0, -earSize * 1.05);
  ctx.quadraticCurveTo(earSize * 0.45, -earSize * 0.7, earSize * 0.5, -earSize * 0.15);
  ctx.closePath();
  ctx.fillStyle = `rgba(255, 180, 205, ${alpha * 0.9})`;
  ctx.fill();
  ctx.restore();

  // Right Ear
  ctx.save();
  ctx.translate(earSize * 0.9, -earSize * 0.45);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(earSize * 0.4, -earSize * 1.1, earSize * 0.1, -earSize * 1.35);
  ctx.quadraticCurveTo(-earSize * 0.6, -earSize * 0.9, -earSize * 0.7, 0);
  ctx.closePath();

  const rightEarGrad = ctx.createLinearGradient(earSize * 0.4, -earSize * 1.35, -earSize * 0.7, 0);
  rightEarGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
  rightEarGrad.addColorStop(1, `rgba(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)}, ${alpha * 0.85})`);
  ctx.fillStyle = rightEarGrad;
  ctx.fill();

  // Inner ear right fluff
  ctx.beginPath();
  ctx.moveTo(-earSize * 0.1, -earSize * 0.15);
  ctx.quadraticCurveTo(earSize * 0.2, -earSize * 0.85, 0, -earSize * 1.05);
  ctx.quadraticCurveTo(-earSize * 0.45, -earSize * 0.7, -earSize * 0.5, -earSize * 0.15);
  ctx.closePath();
  ctx.fillStyle = `rgba(255, 180, 205, ${alpha * 0.9})`;
  ctx.fill();
  ctx.restore();

  ctx.restore(); // Exit head frame

  // --- CUTE CAT NOSE ---
  const noseSize = eyeDistance * 0.18;
  ctx.save();
  ctx.translate(noseTip.x, noseTip.y);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.moveTo(-noseSize, -noseSize * 0.3);
  ctx.quadraticCurveTo(0, -noseSize * 0.6, noseSize, -noseSize * 0.3);
  ctx.quadraticCurveTo(noseSize * 0.6, noseSize * 0.6, 0, noseSize * 0.8);
  ctx.quadraticCurveTo(-noseSize * 0.6, noseSize * 0.6, -noseSize, -noseSize * 0.3);
  ctx.closePath();
  ctx.fillStyle = `rgba(255, 110, 160, ${alpha * 0.95})`;
  ctx.fill();

  // Philtrum line
  ctx.beginPath();
  ctx.moveTo(0, noseSize * 0.8);
  ctx.lineTo(0, noseSize * 1.3);
  ctx.strokeStyle = `rgba(255, 110, 160, ${alpha * 0.9})`;
  ctx.lineWidth = Math.max(2, eyeDistance * 0.02);
  ctx.stroke();

  ctx.restore();

  // --- WHISKERS ---
  const whiskerLen = eyeDistance * 0.85;
  const whiskerStroke = Math.max(1.5, eyeDistance * 0.02);
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.85})`;
  ctx.lineWidth = whiskerStroke;
  ctx.lineCap = 'round';

  // Left cheek whiskers (landmark 205)
  const lCheek = { x: landmarks[205].x * w, y: landmarks[205].y * h };
  const anglesLeft = [-0.18, 0, 0.18];
  anglesLeft.forEach(offsetAngle => {
    ctx.beginPath();
    ctx.moveTo(lCheek.x, lCheek.y);
    const rad = angle + Math.PI + offsetAngle;
    const destX = lCheek.x + Math.cos(rad) * whiskerLen;
    const destY = lCheek.y + Math.sin(rad) * whiskerLen;
    ctx.quadraticCurveTo(
      lCheek.x + Math.cos(rad) * (whiskerLen * 0.5),
      lCheek.y + Math.sin(rad) * (whiskerLen * 0.5) + 6,
      destX,
      destY
    );
    ctx.stroke();
  });

  // Right cheek whiskers (landmark 425)
  const rCheek = { x: landmarks[425].x * w, y: landmarks[425].y * h };
  const anglesRight = [-0.18, 0, 0.18];
  anglesRight.forEach(offsetAngle => {
    ctx.beginPath();
    ctx.moveTo(rCheek.x, rCheek.y);
    const rad = angle + offsetAngle;
    const destX = rCheek.x + Math.cos(rad) * whiskerLen;
    const destY = rCheek.y + Math.sin(rad) * whiskerLen;
    ctx.quadraticCurveTo(
      rCheek.x + Math.cos(rad) * (whiskerLen * 0.5),
      rCheek.y + Math.sin(rad) * (whiskerLen * 0.5) + 6,
      destX,
      destY
    );
    ctx.stroke();
  });

  ctx.restore();
}

/**
 * 2. 3D SUNGLASSES / CYBER VISOR: Realistic specular reflections & metal frames
 */
export function renderSunglasses(
  ctx: CanvasRenderingContext2D,
  landmarks: LandmarkPoint[],
  w: number,
  h: number,
  settings: FilterSettings
) {
  if (landmarks.length < 468) return;

  const { r, g, b } = hexToRgb(settings.color);
  const alpha = (settings.opacity / 100) * (settings.intensity / 100);
  if (alpha <= 0) return;

  const { eyeDistance, angle, noseBridge } = getHeadTransform(landmarks, w, h);
  const glassWidth = eyeDistance * 2.15;
  const glassHeight = eyeDistance * 0.85;

  ctx.save();
  ctx.translate(noseBridge.x, noseBridge.y - glassHeight * 0.15);
  ctx.rotate(angle);
  ctx.filter = settings.blur > 0 ? `blur(${settings.blur * 0.25}px)` : 'none';

  const halfW = glassWidth / 2;
  const halfH = glassHeight / 2;

  // Lenses gradient reflection
  const lensGrad = ctx.createLinearGradient(-halfW, -halfH, halfW, halfH);
  lensGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.95})`);
  lensGrad.addColorStop(0.4, `rgba(${Math.min(255, r + 60)}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 60)}, ${alpha * 0.85})`);
  lensGrad.addColorStop(0.7, `rgba(${Math.max(0, r - 40)}, ${Math.max(0, g - 40)}, ${Math.max(0, b - 40)}, ${alpha * 0.95})`);
  lensGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${alpha * 0.95})`);

  // Left Lens
  const lensW = halfW * 0.88;
  const bridgeGap = halfW * 0.12;

  // Left Lens shape
  ctx.beginPath();
  ctx.roundRect(-lensW - bridgeGap, -halfH, lensW, glassHeight, [halfH * 0.35, halfH * 0.15, halfH * 0.65, halfH * 0.5]);
  ctx.fillStyle = lensGrad;
  ctx.fill();

  // Right Lens shape
  ctx.beginPath();
  ctx.roundRect(bridgeGap, -halfH, lensW, glassHeight, [halfH * 0.15, halfH * 0.35, halfH * 0.5, halfH * 0.65]);
  ctx.fillStyle = lensGrad;
  ctx.fill();

  // Top Brow Bar (metallic frame)
  ctx.beginPath();
  ctx.moveTo(-halfW * 1.05, -halfH);
  ctx.lineTo(halfW * 1.05, -halfH);
  ctx.strokeStyle = `rgba(240, 240, 240, ${alpha * 0.95})`;
  ctx.lineWidth = Math.max(3.5, eyeDistance * 0.04);
  ctx.stroke();

  // Center bridge connector
  ctx.beginPath();
  ctx.moveTo(-bridgeGap, -halfH * 0.4);
  ctx.quadraticCurveTo(0, -halfH * 0.65, bridgeGap, -halfH * 0.4);
  ctx.stroke();

  // Specular high-gloss sheen diagonals across both lenses
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-lensW - bridgeGap, -halfH, lensW, glassHeight, 8);
  ctx.roundRect(bridgeGap, -halfH, lensW, glassHeight, 8);
  ctx.clip();

  // Sheen streak 1
  ctx.beginPath();
  ctx.moveTo(-halfW * 0.8, -halfH * 1.5);
  ctx.lineTo(-halfW * 0.4, halfH * 1.5);
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.45 * (settings.intensity / 100)})`;
  ctx.lineWidth = Math.max(12, eyeDistance * 0.14);
  ctx.stroke();

  // Sheen streak 2
  ctx.beginPath();
  ctx.moveTo(-halfW * 0.25, -halfH * 1.5);
  ctx.lineTo(halfW * 0.15, halfH * 1.5);
  ctx.lineWidth = Math.max(6, eyeDistance * 0.07);
  ctx.stroke();

  ctx.restore();

  ctx.restore();
}

/**
 * 3. CYBER MASK: Sleek futuristic geometric mask tracking jaw and cheek contours
 */
export function renderCyberMask(
  ctx: CanvasRenderingContext2D,
  landmarks: LandmarkPoint[],
  w: number,
  h: number,
  settings: FilterSettings
) {
  if (landmarks.length < 468) return;

  const { r, g, b } = hexToRgb(settings.color);
  const alpha = (settings.opacity / 100) * (settings.intensity / 100);
  if (alpha <= 0) return;

  const { eyeDistance } = getHeadTransform(landmarks, w, h);
  const lineWidth = Math.max(2.2, eyeDistance * 0.026);

  ctx.save();
  ctx.filter = settings.blur > 0 ? `blur(${settings.blur * 0.3}px)` : 'none';
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.85)`;
  ctx.shadowBlur = Math.max(8, eyeDistance * 0.12);
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Cyber Cheek & Jaw lines:
  // Left side: temple 127 -> cheek 117 -> jaw 172 -> chin 152
  ctx.beginPath();
  ctx.moveTo(landmarks[127].x * w, landmarks[127].y * h);
  ctx.lineTo(landmarks[117].x * w, landmarks[117].y * h);
  ctx.lineTo(landmarks[172].x * w, landmarks[172].y * h);
  ctx.lineTo(landmarks[152].x * w, landmarks[152].y * h);
  ctx.stroke();

  // Right side: temple 356 -> cheek 346 -> jaw 397 -> chin 152
  ctx.beginPath();
  ctx.moveTo(landmarks[356].x * w, landmarks[356].y * h);
  ctx.lineTo(landmarks[346].x * w, landmarks[346].y * h);
  ctx.lineTo(landmarks[397].x * w, landmarks[397].y * h);
  ctx.lineTo(landmarks[152].x * w, landmarks[152].y * h);
  ctx.stroke();

  // Cyber Brow Band: 103 -> 9 -> 332
  ctx.beginPath();
  ctx.moveTo(landmarks[103].x * w, landmarks[103].y * h);
  ctx.lineTo(landmarks[9].x * w, landmarks[9].y * h);
  ctx.lineTo(landmarks[332].x * w, landmarks[332].y * h);
  ctx.stroke();

  // Cyber Nose Bridge Hex:
  const nBridge = landmarks[6];
  const nTip = landmarks[1];
  ctx.beginPath();
  ctx.moveTo(landmarks[168].x * w, landmarks[168].y * h);
  ctx.lineTo(landmarks[197].x * w - eyeDistance * 0.15, landmarks[197].y * h);
  ctx.lineTo(nTip.x * w, nTip.y * h);
  ctx.lineTo(landmarks[197].x * w + eyeDistance * 0.15, landmarks[197].y * h);
  ctx.closePath();
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.2})`;
  ctx.fill();
  ctx.stroke();

  // Glowing cyber nodes at corners
  [127, 356, 103, 332, 152].forEach(idx => {
    ctx.beginPath();
    ctx.arc(landmarks[idx].x * w, landmarks[idx].y * h, Math.max(3, eyeDistance * 0.035), 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  });

  ctx.restore();
}

/**
 * 4. ANGEL HALO: Floating glowing elliptical ring with heavenly shimmer
 */
export function renderAngelHalo(
  ctx: CanvasRenderingContext2D,
  landmarks: LandmarkPoint[],
  w: number,
  h: number,
  settings: FilterSettings
) {
  if (landmarks.length < 468) return;

  const { r, g, b } = hexToRgb(settings.color);
  const alpha = (settings.opacity / 100) * (settings.intensity / 100);
  if (alpha <= 0) return;

  const { eyeDistance, angle, topHead } = getHeadTransform(landmarks, w, h);
  const haloRadiusX = eyeDistance * 1.05;
  const haloRadiusY = eyeDistance * 0.32;
  const haloOffsetY = eyeDistance * 0.75;

  ctx.save();
  ctx.translate(topHead.x, topHead.y - haloOffsetY);
  ctx.rotate(angle);
  ctx.filter = settings.blur > 0 ? `blur(${settings.blur * 0.3}px)` : 'none';

  // Outer ethereal aura
  ctx.beginPath();
  ctx.ellipse(0, 0, haloRadiusX * 1.15, haloRadiusY * 1.3, 0, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.35})`;
  ctx.lineWidth = Math.max(12, eyeDistance * 0.14);
  ctx.stroke();

  // Core brilliant halo ring
  ctx.beginPath();
  ctx.ellipse(0, 0, haloRadiusX, haloRadiusY, 0, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${Math.min(255, r + 50)}, ${Math.min(255, g + 50)}, ${Math.min(255, b + 50)}, ${alpha * 0.95})`;
  ctx.lineWidth = Math.max(4, eyeDistance * 0.05);
  ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 1)`;
  ctx.shadowBlur = Math.max(16, eyeDistance * 0.2);
  ctx.stroke();

  // Inner bright highlight arc
  ctx.beginPath();
  ctx.ellipse(0, 0, haloRadiusX, haloRadiusY, 0, Math.PI * 0.8, Math.PI * 1.4);
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.lineWidth = Math.max(2.5, eyeDistance * 0.03);
  ctx.stroke();

  ctx.restore();
}

/**
 * 5. DEVIL HORNS: Curved volcanic horns with glowing ember cores
 */
export function renderDevilHorns(
  ctx: CanvasRenderingContext2D,
  landmarks: LandmarkPoint[],
  w: number,
  h: number,
  settings: FilterSettings
) {
  if (landmarks.length < 468) return;

  const { r, g, b } = hexToRgb(settings.color);
  const alpha = (settings.opacity / 100) * (settings.intensity / 100);
  if (alpha <= 0) return;

  const { eyeDistance, angle, topHead } = getHeadTransform(landmarks, w, h);
  const hornSize = eyeDistance * 0.85;

  ctx.save();
  ctx.translate(topHead.x, topHead.y - eyeDistance * 0.1);
  ctx.rotate(angle);
  ctx.filter = settings.blur > 0 ? `blur(${settings.blur * 0.3}px)` : 'none';

  // Left Horn
  ctx.save();
  ctx.translate(-eyeDistance * 0.55, 0);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  // Curve outward and up
  ctx.quadraticCurveTo(-hornSize * 0.5, -hornSize * 0.7, -hornSize * 0.25, -hornSize * 1.2);
  ctx.quadraticCurveTo(hornSize * 0.05, -hornSize * 0.65, hornSize * 0.25, 0);
  ctx.closePath();

  const leftHornGrad = ctx.createLinearGradient(0, 0, -hornSize * 0.25, -hornSize * 1.2);
  leftHornGrad.addColorStop(0, `rgba(20, 20, 20, ${alpha * 0.95})`);
  leftHornGrad.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${alpha * 0.95})`);
  leftHornGrad.addColorStop(1, `rgba(255, 220, 100, ${alpha})`);

  ctx.fillStyle = leftHornGrad;
  ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.9)`;
  ctx.shadowBlur = Math.max(10, eyeDistance * 0.14);
  ctx.fill();
  ctx.restore();

  // Right Horn
  ctx.save();
  ctx.translate(eyeDistance * 0.55, 0);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  // Curve outward and up
  ctx.quadraticCurveTo(hornSize * 0.5, -hornSize * 0.7, hornSize * 0.25, -hornSize * 1.2);
  ctx.quadraticCurveTo(-hornSize * 0.05, -hornSize * 0.65, -hornSize * 0.25, 0);
  ctx.closePath();

  const rightHornGrad = ctx.createLinearGradient(0, 0, hornSize * 0.25, -hornSize * 1.2);
  rightHornGrad.addColorStop(0, `rgba(20, 20, 20, ${alpha * 0.95})`);
  rightHornGrad.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${alpha * 0.95})`);
  rightHornGrad.addColorStop(1, `rgba(255, 220, 100, ${alpha})`);

  ctx.fillStyle = rightHornGrad;
  ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.9)`;
  ctx.shadowBlur = Math.max(10, eyeDistance * 0.14);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}
