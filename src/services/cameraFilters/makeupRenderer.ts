import { FilterSettings } from '@/types/camera';

interface Point {
  x: number;
  y: number;
}

// Convert normalized landmark (0-1) to canvas pixel coordinates
function toPixel(landmark: { x: number; y: number }, width: number, height: number): Point {
  return {
    x: landmark.x * width,
    y: landmark.y * height,
  };
}

// Convert hex to rgba
function hexToRgba(hex: string, alpha: number): string {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((char) => char + char).join('');
  }
  const num = parseInt(c, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

// Draw smooth path through points
function drawPath(ctx: CanvasRenderingContext2D, points: Point[], close: boolean = false) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = (prev.x + curr.x) / 2;
    const midY = (prev.y + curr.y) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
  }

  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  if (close) {
    ctx.closePath();
  }
}

/**
 * 1. LIPSTICK RENDERER
 * Realistic lip coloring with glossy highlight and customizable blur & opacity
 */
export function renderLipstick(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
  settings: FilterSettings
) {
  if (!settings.enabled || settings.opacity <= 0) return;

  const upperLipOuterIdx = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
  const upperLipInnerIdx = [291, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78, 61];

  const lowerLipOuterIdx = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291];
  const lowerLipInnerIdx = [291, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78, 61];

  const upperLipOuter = upperLipOuterIdx.map((i) => toPixel(landmarks[i], width, height));
  const upperLipInner = upperLipInnerIdx.map((i) => toPixel(landmarks[i], width, height));
  const lowerLipOuter = lowerLipOuterIdx.map((i) => toPixel(landmarks[i], width, height));
  const lowerLipInner = lowerLipInnerIdx.map((i) => toPixel(landmarks[i], width, height));

  const alpha = (settings.opacity / 100) * (settings.intensity / 100) * 0.75;
  const fillColor = hexToRgba(settings.color, alpha);

  ctx.save();
  if (settings.blur > 0) {
    ctx.filter = `blur(${settings.blur}px)`;
  }
  ctx.fillStyle = fillColor;

  // Render Upper Lip
  ctx.beginPath();
  ctx.moveTo(upperLipOuter[0].x, upperLipOuter[0].y);
  upperLipOuter.forEach((p) => ctx.lineTo(p.x, p.y));
  upperLipInner.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.closePath();
  ctx.fill();

  // Render Lower Lip
  ctx.beginPath();
  ctx.moveTo(lowerLipOuter[0].x, lowerLipOuter[0].y);
  lowerLipOuter.forEach((p) => ctx.lineTo(p.x, p.y));
  lowerLipInner.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.closePath();
  ctx.fill();

  // Gloss / Specular reflection highlight on lower lip
  const centerBottom = toPixel(landmarks[17], width, height);
  const centerInner = toPixel(landmarks[14], width, height);
  const glossWidth = Math.abs(toPixel(landmarks[291], width, height).x - toPixel(landmarks[61], width, height).x) * 0.22;
  const glossHeight = Math.abs(centerBottom.y - centerInner.y) * 0.45;

  const glossGrad = ctx.createRadialGradient(
    (centerBottom.x + centerInner.x) / 2,
    (centerBottom.y + centerInner.y) / 2,
    1,
    (centerBottom.x + centerInner.x) / 2,
    (centerBottom.y + centerInner.y) / 2,
    Math.max(glossWidth, glossHeight, 8)
  );
  glossGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
  glossGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
  glossGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = glossGrad;
  ctx.beginPath();
  ctx.ellipse(
    (centerBottom.x + centerInner.x) / 2,
    (centerBottom.y + centerInner.y) / 2,
    glossWidth,
    Math.max(glossHeight, 3),
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.restore();
}

/**
 * 2. BLUSH RENDERER
 * Soft radial blush on cheeks with natural falloff
 */
export function renderBlush(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
  settings: FilterSettings
) {
  if (!settings.enabled || settings.opacity <= 0) return;

  // Face width scale
  const leftCheekbone = toPixel(landmarks[234], width, height);
  const rightCheekbone = toPixel(landmarks[454], width, height);
  const faceWidth = Math.hypot(rightCheekbone.x - leftCheekbone.x, rightCheekbone.y - leftCheekbone.y);

  // Left cheek center (landmark 116 / 205)
  const leftCheek = toPixel(landmarks[116], width, height);
  // Right cheek center (landmark 345 / 425)
  const rightCheek = toPixel(landmarks[345], width, height);

  const radius = faceWidth * 0.16 * (settings.intensity / 65);
  const alpha = (settings.opacity / 100) * (settings.intensity / 100) * 0.55;

  ctx.save();
  if (settings.blur > 0) {
    ctx.filter = `blur(${settings.blur}px)`;
  }

  // Left Cheek
  const leftGrad = ctx.createRadialGradient(
    leftCheek.x, leftCheek.y, radius * 0.1,
    leftCheek.x, leftCheek.y, radius
  );
  leftGrad.addColorStop(0, hexToRgba(settings.color, alpha));
  leftGrad.addColorStop(0.5, hexToRgba(settings.color, alpha * 0.5));
  leftGrad.addColorStop(1, hexToRgba(settings.color, 0));

  ctx.fillStyle = leftGrad;
  ctx.beginPath();
  ctx.ellipse(leftCheek.x, leftCheek.y, radius, radius * 0.75, Math.PI / 12, 0, Math.PI * 2);
  ctx.fill();

  // Right Cheek
  const rightGrad = ctx.createRadialGradient(
    rightCheek.x, rightCheek.y, radius * 0.1,
    rightCheek.x, rightCheek.y, radius
  );
  rightGrad.addColorStop(0, hexToRgba(settings.color, alpha));
  rightGrad.addColorStop(0.5, hexToRgba(settings.color, alpha * 0.5));
  rightGrad.addColorStop(1, hexToRgba(settings.color, 0));

  ctx.fillStyle = rightGrad;
  ctx.beginPath();
  ctx.ellipse(rightCheek.x, rightCheek.y, radius, radius * 0.75, -Math.PI / 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * 3. EYELINER RENDERER
 * Traces upper lash lines with classic, winged, or bold styles
 */
export function renderEyeliner(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
  settings: FilterSettings
) {
  if (!settings.enabled || settings.opacity <= 0) return;

  const leftLashIdx = [33, 246, 161, 160, 159, 158, 157, 173, 133];
  const rightLashIdx = [362, 398, 384, 385, 386, 387, 388, 466, 263];

  const leftLash = leftLashIdx.map((i) => toPixel(landmarks[i], width, height));
  const rightLash = rightLashIdx.map((i) => toPixel(landmarks[i], width, height));

  const leftCornerOuter = leftLash[0]; // 33
  const leftCornerInner = leftLash[leftLash.length - 1]; // 133
  const rightCornerInner = rightLash[0]; // 362
  const rightCornerOuter = rightLash[rightLash.length - 1]; // 263

  const eyeSpan = Math.hypot(leftCornerOuter.x - leftCornerInner.x, leftCornerOuter.y - leftCornerInner.y);
  const lineWidth = Math.max(1.8, (eyeSpan * 0.08) * (settings.intensity / 65));
  const alpha = (settings.opacity / 100) * (settings.intensity / 100);

  ctx.save();
  ctx.strokeStyle = hexToRgba(settings.color, alpha);
  ctx.fillStyle = hexToRgba(settings.color, alpha);
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Left Eye Line
  drawPath(ctx, leftLash, false);
  ctx.stroke();

  // Right Eye Line
  drawPath(ctx, rightLash, false);
  ctx.stroke();

  // Wing Style
  const isWing = settings.subType === 'wing' || settings.subType === 'bold' || !settings.subType;
  if (isWing) {
    const wingFactor = settings.subType === 'bold' ? 0.35 : 0.24;
    const wingLength = eyeSpan * wingFactor * (settings.intensity / 70);

    // Left Wing (extending outward from outer corner)
    const leftDx = leftCornerOuter.x - leftCornerInner.x;
    const leftDy = leftCornerOuter.y - leftCornerInner.y;
    const leftAngle = Math.atan2(leftDy, leftDx) - 0.25;

    const leftWingTip = {
      x: leftCornerOuter.x + Math.cos(leftAngle) * wingLength,
      y: leftCornerOuter.y + Math.sin(leftAngle) * wingLength - wingLength * 0.35,
    };

    ctx.beginPath();
    ctx.moveTo(leftLash[1].x, leftLash[1].y);
    ctx.lineTo(leftCornerOuter.x, leftCornerOuter.y);
    ctx.lineTo(leftWingTip.x, leftWingTip.y);
    ctx.lineTo(leftLash[2].x, leftLash[2].y);
    ctx.closePath();
    ctx.fill();

    // Right Wing
    const rightDx = rightCornerOuter.x - rightCornerInner.x;
    const rightDy = rightCornerOuter.y - rightCornerInner.y;
    const rightAngle = Math.atan2(rightDy, rightDx) + 0.25;

    const rightWingTip = {
      x: rightCornerOuter.x + Math.cos(rightAngle) * wingLength,
      y: rightCornerOuter.y + Math.sin(rightAngle) * wingLength - wingLength * 0.35,
    };

    ctx.beginPath();
    ctx.moveTo(rightLash[rightLash.length - 2].x, rightLash[rightLash.length - 2].y);
    ctx.lineTo(rightCornerOuter.x, rightCornerOuter.y);
    ctx.lineTo(rightWingTip.x, rightWingTip.y);
    ctx.lineTo(rightLash[rightLash.length - 3].x, rightLash[rightLash.length - 3].y);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/**
 * 4. EYESHADOW RENDERER
 * Soft diffused eyeshadow gradient above the upper eyelid crease
 */
export function renderEyeshadow(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
  settings: FilterSettings
) {
  if (!settings.enabled || settings.opacity <= 0) return;

  // Eyebrow and eye crease points
  const leftSocketIdx = [33, 246, 161, 160, 159, 158, 157, 173, 133, 190, 56, 28, 27, 29, 30, 247, 33];
  const rightSocketIdx = [263, 466, 388, 387, 386, 385, 384, 398, 362, 414, 286, 258, 257, 259, 260, 467, 263];

  const leftSocket = leftSocketIdx.map((i) => toPixel(landmarks[i], width, height));
  const rightSocket = rightSocketIdx.map((i) => toPixel(landmarks[i], width, height));

  const alpha = (settings.opacity / 100) * (settings.intensity / 100) * 0.45;

  ctx.save();
  ctx.filter = `blur(${Math.max(4, settings.blur || 6)}px)`;
  ctx.fillStyle = hexToRgba(settings.color, alpha);

  // Left Eye Socket
  ctx.beginPath();
  leftSocket.forEach((p, idx) => {
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fill();

  // Right Eye Socket
  ctx.beginPath();
  rightSocket.forEach((p, idx) => {
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * 5. BEAUTY SMOOTH RENDERER
 * Skin smoothing and radiant porcelain luminance overlay
 */
export function renderBeautySmooth(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
  settings: FilterSettings
) {
  if (!settings.enabled || settings.opacity <= 0) return;

  // Face contour loop
  const faceOvalIdx = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
    400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
    54, 103, 67, 109, 10
  ];

  // Eyes and mouth exclusion loops so features remain crisp
  const leftEyeIdx = [33, 160, 158, 133, 153, 144];
  const rightEyeIdx = [362, 385, 387, 263, 373, 380];
  const mouthIdx = [61, 37, 267, 291, 314, 17, 84];

  const facePoints = faceOvalIdx.map((i) => toPixel(landmarks[i], width, height));
  const leftEyePoints = leftEyeIdx.map((i) => toPixel(landmarks[i], width, height));
  const rightEyePoints = rightEyeIdx.map((i) => toPixel(landmarks[i], width, height));
  const mouthPoints = mouthIdx.map((i) => toPixel(landmarks[i], width, height));

  const noseCenter = toPixel(landmarks[1], width, height);
  const chin = toPixel(landmarks[152], width, height);
  const forehead = toPixel(landmarks[10], width, height);
  const faceHeight = Math.hypot(chin.x - forehead.x, chin.y - forehead.y);

  const alpha = (settings.opacity / 100) * (settings.intensity / 100) * 0.38;

  ctx.save();
  // Clip path to face oval excluding eyes & mouth
  ctx.beginPath();
  // Face outer boundary
  facePoints.forEach((p, idx) => {
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();

  // Left Eye cutout
  leftEyePoints.forEach((p, idx) => {
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();

  // Right Eye cutout
  rightEyePoints.forEach((p, idx) => {
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();

  // Mouth cutout
  mouthPoints.forEach((p, idx) => {
    if (idx === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();

  // EvenOdd fill rule cuts out eyes and mouth
  ctx.clip('evenodd');

  ctx.filter = `blur(${Math.max(3, settings.blur || 5)}px)`;
  ctx.globalCompositeOperation = 'soft-light';

  // Smooth skin tone radial glow
  const skinGlow = ctx.createRadialGradient(
    noseCenter.x, noseCenter.y, faceHeight * 0.1,
    noseCenter.x, noseCenter.y, faceHeight * 0.6
  );
  skinGlow.addColorStop(0, hexToRgba(settings.color || '#fed7aa', alpha));
  skinGlow.addColorStop(0.7, hexToRgba(settings.color || '#fed7aa', alpha * 0.6));
  skinGlow.addColorStop(1, hexToRgba(settings.color || '#fed7aa', 0));

  ctx.fillStyle = skinGlow;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();
}
