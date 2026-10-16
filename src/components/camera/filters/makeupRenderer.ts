import { FilterSettings, LandmarkPoint } from '../types';

// Convert hex to rgb
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

// Landmark helper to get canvas coordinates
function pt(lm: LandmarkPoint, w: number, h: number): [number, number] {
  return [lm.x * w, lm.y * h];
}

// MediaPipe 468 landmark lip indices
const OUTER_LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const INNER_LIPS = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];

// MediaPipe eye indices for makeup
const LEFT_EYE_LASH = [33, 160, 158, 159, 133];
const RIGHT_EYE_LASH = [362, 385, 386, 387, 263];

const LEFT_EYELID = [33, 160, 158, 159, 133, 173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYELID = [362, 385, 386, 387, 263, 466, 388, 387, 386, 385, 384, 398];

// Face oval boundary for skin smoothing
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
  54, 103, 67, 109
];

const LEFT_EYE_FULL = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE_FULL = [362, 385, 387, 263, 373, 380];

/**
 * 1. LIPSTICK: High-precision cosmetic tint with non-overlapping mouth cavity and gloss glint
 */
export function renderLipstick(
  ctx: CanvasRenderingContext2D,
  landmarks: LandmarkPoint[],
  w: number,
  h: number,
  settings: FilterSettings
) {
  if (landmarks.length < 468) return;

  const { r, g, b } = hexToRgb(settings.color);
  const alpha = (settings.opacity / 100) * (settings.intensity / 100) * 0.72;
  if (alpha <= 0) return;

  ctx.save();
  ctx.filter = settings.blur > 0 ? `blur(${Math.max(1, settings.blur * 0.35)}px)` : 'none';
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;

  // Use evenodd fill rule: Outer lips clockwise, inner lips counter-clockwise
  ctx.beginPath();
  const [startOutX, startOutY] = pt(landmarks[OUTER_LIPS[0]], w, h);
  ctx.moveTo(startOutX, startOutY);
  for (let i = 1; i < OUTER_LIPS.length; i++) {
    const [x, y] = pt(landmarks[OUTER_LIPS[i]], w, h);
    ctx.lineTo(x, y);
  }
  ctx.closePath();

  // Cut out inner mouth cavity
  const [startInX, startInY] = pt(landmarks[INNER_LIPS[0]], w, h);
  ctx.moveTo(startInX, startInY);
  for (let i = 1; i < INNER_LIPS.length; i++) {
    const [x, y] = pt(landmarks[INNER_LIPS[i]], w, h);
    ctx.lineTo(x, y);
  }
  ctx.closePath();

  ctx.fill('evenodd');

  // Subtle natural lip shine on lower lip center (landmark 14 / 17)
  const [shineX, shineY] = pt(landmarks[17], w, h);
  const lipWidth = Math.hypot(
    (landmarks[291].x - landmarks[61].x) * w,
    (landmarks[291].y - landmarks[61].y) * h
  );
  const shineRadius = Math.max(4, lipWidth * 0.16);

  const shineGrad = ctx.createRadialGradient(shineX, shineY - 2, 1, shineX, shineY - 2, shineRadius);
  shineGrad.addColorStop(0, `rgba(255, 255, 255, ${0.35 * (settings.intensity / 100)})`);
  shineGrad.addColorStop(0.5, `rgba(255, 255, 255, ${0.12 * (settings.intensity / 100)})`);
  shineGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = shineGrad;
  ctx.beginPath();
  ctx.arc(shineX, shineY - 2, shineRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * 2. BLUSH: Soft-focus gradient cheek blush with feathered dispersion
 */
export function renderBlush(
  ctx: CanvasRenderingContext2D,
  landmarks: LandmarkPoint[],
  w: number,
  h: number,
  settings: FilterSettings
) {
  if (landmarks.length < 468) return;

  const { r, g, b } = hexToRgb(settings.color);
  const alpha = (settings.opacity / 100) * (settings.intensity / 100) * 0.45;
  if (alpha <= 0) return;

  // Face scale reference: eye-to-eye distance
  const eyeDist = Math.hypot(
    (landmarks[263].x - landmarks[33].x) * w,
    (landmarks[263].y - landmarks[33].y) * h
  );
  const blushRadius = Math.max(15, eyeDist * 0.42);

  // Left cheek center (midpoint between 117 and 50)
  const leftX = ((landmarks[117].x + landmarks[50].x) / 2) * w;
  const leftY = ((landmarks[117].y + landmarks[50].y) / 2) * h;

  // Right cheek center (midpoint between 346 and 280)
  const rightX = ((landmarks[346].x + landmarks[280].x) / 2) * w;
  const rightY = ((landmarks[346].y + landmarks[280].y) / 2) * h;

  ctx.save();
  ctx.filter = `blur(${Math.max(6, settings.blur * 1.2)}px)`;

  // Left cheek gradient
  const leftGrad = ctx.createRadialGradient(leftX, leftY, 0, leftX, leftY, blushRadius);
  leftGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
  leftGrad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`);
  leftGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

  ctx.fillStyle = leftGrad;
  ctx.beginPath();
  ctx.arc(leftX, leftY, blushRadius, 0, Math.PI * 2);
  ctx.fill();

  // Right cheek gradient
  const rightGrad = ctx.createRadialGradient(rightX, rightY, 0, rightX, rightY, blushRadius);
  rightGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
  rightGrad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`);
  rightGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

  ctx.fillStyle = rightGrad;
  ctx.beginPath();
  ctx.arc(rightX, rightY, blushRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * 3. EYELINER: Crisp winged liquid eyeliner along upper lash line with flick
 */
export function renderEyeliner(
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

  const eyeDist = Math.hypot(
    (landmarks[263].x - landmarks[33].x) * w,
    (landmarks[263].y - landmarks[33].y) * h
  );
  const strokeWidth = Math.max(1.8, eyeDist * 0.024 * (settings.intensity / 100));

  ctx.save();
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.filter = settings.blur > 0 ? `blur(${settings.blur * 0.25}px)` : 'none';

  // Left Eye: Lash line + Wing flick
  ctx.beginPath();
  const [lStartX, lStartY] = pt(landmarks[LEFT_EYE_LASH[0]], w, h);
  ctx.moveTo(lStartX, lStartY);
  for (let i = 1; i < LEFT_EYE_LASH.length; i++) {
    const [x, y] = pt(landmarks[LEFT_EYE_LASH[i]], w, h);
    ctx.lineTo(x, y);
  }
  // Wing flick towards temple (extend out from outer corner 33)
  const lOuter = landmarks[33];
  const lInner = landmarks[133];
  const lDx = (lOuter.x - lInner.x) * w;
  const lDy = (lOuter.y - lInner.y) * h;
  const wingLen = eyeDist * 0.12 * (settings.intensity / 100);
  const lWingX = lOuter.x * w + (lDx / Math.hypot(lDx, lDy)) * wingLen;
  const lWingY = lOuter.y * w + (lDy / Math.hypot(lDx, lDy)) * wingLen - wingLen * 0.45;
  ctx.lineTo(lWingX, lWingY);
  ctx.stroke();

  // Right Eye: Lash line + Wing flick
  ctx.beginPath();
  const [rStartX, rStartY] = pt(landmarks[RIGHT_EYE_LASH[0]], w, h);
  ctx.moveTo(rStartX, rStartY);
  for (let i = 1; i < RIGHT_EYE_LASH.length; i++) {
    const [x, y] = pt(landmarks[RIGHT_EYE_LASH[i]], w, h);
    ctx.lineTo(x, y);
  }
  // Wing flick towards right temple (extend out from outer corner 263)
  const rOuter = landmarks[263];
  const rInner = landmarks[362];
  const rDx = (rOuter.x - rInner.x) * w;
  const rDy = (rOuter.y - rInner.y) * h;
  const rWingX = rOuter.x * w + (rDx / Math.hypot(rDx, rDy)) * wingLen;
  const rWingY = rOuter.y * h + (rDy / Math.hypot(rDx, rDy)) * wingLen - wingLen * 0.45;
  ctx.lineTo(rWingX, rWingY);
  ctx.stroke();

  ctx.restore();
}

/**
 * 4. EYESHADOW: Smoky blend across upper eyelid with soft feathering
 */
export function renderEyeshadow(
  ctx: CanvasRenderingContext2D,
  landmarks: LandmarkPoint[],
  w: number,
  h: number,
  settings: FilterSettings
) {
  if (landmarks.length < 468) return;

  const { r, g, b } = hexToRgb(settings.color);
  const alpha = (settings.opacity / 100) * (settings.intensity / 100) * 0.5;
  if (alpha <= 0) return;

  ctx.save();
  ctx.filter = `blur(${Math.max(4, settings.blur * 0.9)}px)`;
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;

  // Left eyelid socket contour
  ctx.beginPath();
  const [lStartX, lStartY] = pt(landmarks[LEFT_EYELID[0]], w, h);
  ctx.moveTo(lStartX, lStartY);
  for (let i = 1; i < LEFT_EYELID.length; i++) {
    const [x, y] = pt(landmarks[LEFT_EYELID[i]], w, h);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // Right eyelid socket contour
  ctx.beginPath();
  const [rStartX, rStartY] = pt(landmarks[RIGHT_EYELID[0]], w, h);
  ctx.moveTo(rStartX, rStartY);
  for (let i = 1; i < RIGHT_EYELID.length; i++) {
    const [x, y] = pt(landmarks[RIGHT_EYELID[i]], w, h);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * 5. BEAUTY SMOOTH: Skin smoothing & soft-focus radiant complexion filter
 */
export function renderBeautySmooth(
  ctx: CanvasRenderingContext2D,
  landmarks: LandmarkPoint[],
  w: number,
  h: number,
  settings: FilterSettings
) {
  if (landmarks.length < 468) return;

  const { r, g, b } = hexToRgb(settings.color);
  const alpha = (settings.opacity / 100) * (settings.intensity / 100) * 0.32;
  if (alpha <= 0) return;

  ctx.save();

  // Clip to face oval while excluding eyes and lips so facial features remain razor sharp
  ctx.beginPath();
  const [fX, fY] = pt(landmarks[FACE_OVAL[0]], w, h);
  ctx.moveTo(fX, fY);
  for (let i = 1; i < FACE_OVAL.length; i++) {
    const [x, y] = pt(landmarks[FACE_OVAL[i]], w, h);
    ctx.lineTo(x, y);
  }
  ctx.closePath();

  // Exclude left eye
  const [leX, leY] = pt(landmarks[LEFT_EYE_FULL[0]], w, h);
  ctx.moveTo(leX, leY);
  for (let i = 1; i < LEFT_EYE_FULL.length; i++) {
    const [x, y] = pt(landmarks[LEFT_EYE_FULL[i]], w, h);
    ctx.lineTo(x, y);
  }
  ctx.closePath();

  // Exclude right eye
  const [reX, reY] = pt(landmarks[RIGHT_EYE_FULL[0]], w, h);
  ctx.moveTo(reX, reY);
  for (let i = 1; i < RIGHT_EYE_FULL.length; i++) {
    const [x, y] = pt(landmarks[RIGHT_EYE_FULL[i]], w, h);
    ctx.lineTo(x, y);
  }
  ctx.closePath();

  // Exclude lips
  const [lpX, lpY] = pt(landmarks[OUTER_LIPS[0]], w, h);
  ctx.moveTo(lpX, lpY);
  for (let i = 1; i < OUTER_LIPS.length; i++) {
    const [x, y] = pt(landmarks[OUTER_LIPS[i]], w, h);
    ctx.lineTo(x, y);
  }
  ctx.closePath();

  // Apply foundation tint and skin-smoothing blur
  ctx.clip('evenodd');
  ctx.filter = `blur(${Math.max(8, (settings.blur + 6) * 1.1)}px)`;
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  ctx.fillRect(0, 0, w, h);

  // Soft-light porcelain highlight on forehead & bridge
  const [noseX, noseY] = pt(landmarks[6], w, h);
  const glowGrad = ctx.createRadialGradient(noseX, noseY - 20, 5, noseX, noseY - 20, w * 0.28);
  glowGrad.addColorStop(0, `rgba(255, 255, 255, ${0.18 * (settings.intensity / 100)})`);
  glowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
}
