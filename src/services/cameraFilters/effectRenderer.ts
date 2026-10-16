import { FilterSettings } from '@/types/camera';

interface Point {
  x: number;
  y: number;
}

function toPixel(landmark: { x: number; y: number }, width: number, height: number): Point {
  return {
    x: landmark.x * width,
    y: landmark.y * height,
  };
}

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

/**
 * 1. CAT EARS & FACE FILTER (বিড়ালের ফিল্টার)
 * Ears atop head, cute cat nose tip, and whiskers on cheeks
 */
export function renderCatFace(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
  settings: FilterSettings
) {
  if (!settings.enabled || settings.opacity <= 0) return;

  const foreheadTop = toPixel(landmarks[10], width, height);
  const leftForehead = toPixel(landmarks[103], width, height);
  const rightForehead = toPixel(landmarks[338], width, height);
  const noseTip = toPixel(landmarks[1], width, height);
  const leftCheek = toPixel(landmarks[205], width, height);
  const rightCheek = toPixel(landmarks[425], width, height);

  // Face angle & scale
  const dx = rightForehead.x - leftForehead.x;
  const dy = rightForehead.y - leftForehead.y;
  const angle = Math.atan2(dy, dx);
  const headWidth = Math.hypot(dx, dy);
  const earSize = headWidth * 0.72 * (settings.intensity / 75);
  const alpha = (settings.opacity / 100) * (settings.intensity / 100);

  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);

  // Render Ears
  ctx.save();
  ctx.translate(foreheadTop.x, foreheadTop.y);
  ctx.rotate(angle);

  const mainColor = settings.color || '#f43f5e';
  const earDistance = headWidth * 0.52;

  // Left Ear
  drawCatEar(ctx, -earDistance, -earSize * 0.35, earSize, -0.22, mainColor);
  // Right Ear
  drawCatEar(ctx, earDistance, -earSize * 0.35, earSize, 0.22, mainColor);

  ctx.restore();

  // Cute Cat Nose Tip
  ctx.save();
  const noseSize = headWidth * 0.12 * (settings.intensity / 75);
  ctx.translate(noseTip.x, noseTip.y);
  ctx.rotate(angle);

  ctx.fillStyle = mainColor;
  ctx.beginPath();
  // Inverted rounded triangle nose
  ctx.moveTo(-noseSize, -noseSize * 0.4);
  ctx.quadraticCurveTo(0, -noseSize * 0.7, noseSize, -noseSize * 0.4);
  ctx.quadraticCurveTo(noseSize * 0.8, noseSize * 0.5, 0, noseSize * 0.8);
  ctx.quadraticCurveTo(-noseSize * 0.8, noseSize * 0.5, -noseSize, -noseSize * 0.4);
  ctx.closePath();
  ctx.fill();

  // Tiny nose cleft line
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, noseSize * 0.8);
  ctx.lineTo(0, noseSize * 1.4);
  ctx.stroke();

  ctx.restore();

  // Whiskers
  ctx.save();
  ctx.strokeStyle = settings.subType === 'black_cat' ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.65)';
  ctx.lineWidth = Math.max(1.8, headWidth * 0.015);
  ctx.lineCap = 'round';

  const whiskerLen = headWidth * 0.55 * (settings.intensity / 75);

  // Left Whiskers
  drawWhiskerSet(ctx, leftCheek.x, leftCheek.y, angle + Math.PI, whiskerLen);
  // Right Whiskers
  drawWhiskerSet(ctx, rightCheek.x, rightCheek.y, angle, whiskerLen);

  ctx.restore();
  ctx.restore();
}

function drawCatEar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tilt: number,
  color: string
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);

  // Outer Ear
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-size * 0.42, 0);
  ctx.quadraticCurveTo(-size * 0.48, -size * 0.7, 0, -size * 1.15);
  ctx.quadraticCurveTo(size * 0.48, -size * 0.7, size * 0.42, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Inner Ear Fluff (Pink)
  ctx.fillStyle = '#ffccd5';
  ctx.beginPath();
  ctx.moveTo(-size * 0.25, -size * 0.08);
  ctx.quadraticCurveTo(-size * 0.28, -size * 0.55, 0, -size * 0.9);
  ctx.quadraticCurveTo(size * 0.28, -size * 0.55, size * 0.25, -size * 0.08);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawWhiskerSet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  baseAngle: number,
  length: number
) {
  const angles = [-0.18, 0, 0.18];
  angles.forEach((offset, idx) => {
    const a = baseAngle + offset;
    const startX = x + Math.cos(a) * 6;
    const startY = y + Math.sin(a) * 6 + (idx - 1) * 4;
    const endX = startX + Math.cos(a) * length;
    const endY = startY + Math.sin(a) * length + Math.sin(offset * 2) * 8;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(
      (startX + endX) / 2,
      (startY + endY) / 2 + (idx === 0 ? -4 : idx === 2 ? 4 : 0),
      endX,
      endY
    );
    ctx.stroke();
  });
}

/**
 * 2. 3D & STYLISH SUNGLASSES (সানগ্লাস)
 * Aligns dynamically across eye bridge with perspective tilt
 */
export function renderSunglasses(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
  settings: FilterSettings
) {
  if (!settings.enabled || settings.opacity <= 0) return;

  const leftEyeOuter = toPixel(landmarks[33], width, height);
  const rightEyeOuter = toPixel(landmarks[263], width, height);
  const eyeBridge = toPixel(landmarks[168], width, height); // Center of nose bridge

  const dx = rightEyeOuter.x - leftEyeOuter.x;
  const dy = rightEyeOuter.y - leftEyeOuter.y;
  const angle = Math.atan2(dy, dx);
  const eyeSpan = Math.hypot(dx, dy);

  const glassScale = (eyeSpan * 1.6) * (settings.intensity / 75);
  const alpha = (settings.opacity / 100) * (settings.intensity / 100);

  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.translate(eyeBridge.x, eyeBridge.y);
  ctx.rotate(angle);

  const style = settings.subType || 'aviator';
  const frameColor = settings.color || '#09090b';

  if (style === 'pixel') {
    // Thug Life 8-bit Pixel Shades
    drawPixelShades(ctx, glassScale, frameColor);
  } else if (style === 'round') {
    // Retro Round Steampunk/Lennon Glasses
    drawRoundShades(ctx, glassScale, frameColor);
  } else if (style === 'cyber') {
    // Cyber Visor
    drawCyberVisor(ctx, glassScale, frameColor);
  } else {
    // Default: Cool Aviator Sunglasses
    drawAviatorShades(ctx, glassScale, frameColor);
  }

  ctx.restore();
}

function drawAviatorShades(ctx: CanvasRenderingContext2D, width: number, color: string) {
  const lensW = width * 0.44;
  const lensH = lensW * 0.88;
  const gap = width * 0.12;

  // Bridge Bar
  ctx.strokeStyle = color;
  ctx.lineWidth = width * 0.035;
  ctx.beginPath();
  ctx.moveTo(-gap * 1.8, -lensH * 0.38);
  ctx.lineTo(gap * 1.8, -lensH * 0.38);
  ctx.stroke();

  // Nose Bridge Arch
  ctx.beginPath();
  ctx.arc(0, -lensH * 0.15, gap * 0.7, Math.PI, 0);
  ctx.stroke();

  // Left & Right Lenses
  [-1, 1].forEach((dir) => {
    const cx = dir * (gap * 0.5 + lensW * 0.5);
    const cy = 0;

    // Lens Path (Teardrop shape)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, lensW * 0.48, lensH * 0.52, dir * 0.12, 0, Math.PI * 2);

    // Lens Gradient Tint
    const grad = ctx.createLinearGradient(cx - lensW * 0.5, cy - lensH * 0.5, cx + lensW * 0.5, cy + lensH * 0.5);
    grad.addColorStop(0, color);
    grad.addColorStop(0.6, hexToRgba(color, 0.85));
    grad.addColorStop(1, 'rgba(30, 41, 59, 0.75)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Mirror Glare Reflection
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.beginPath();
    ctx.ellipse(cx - lensW * 0.12, cy - lensH * 0.16, lensW * 0.32, lensH * 0.18, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    // Metallic Rim
    ctx.strokeStyle = color === '#09090b' ? '#d4af37' : color; // Gold or custom
    ctx.lineWidth = width * 0.024;
    ctx.stroke();
    ctx.restore();
  });
}

function drawRoundShades(ctx: CanvasRenderingContext2D, width: number, color: string) {
  const radius = width * 0.22;
  const gap = width * 0.14;

  // Bridge
  ctx.strokeStyle = color;
  ctx.lineWidth = width * 0.03;
  ctx.beginPath();
  ctx.arc(0, -radius * 0.3, gap * 0.65, Math.PI, 0);
  ctx.stroke();

  [-1, 1].forEach((dir) => {
    const cx = dir * (gap * 0.5 + radius);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, 0, radius, 0, Math.PI * 2);

    const grad = ctx.createRadialGradient(cx - radius * 0.3, -radius * 0.3, 2, cx, 0, radius);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    grad.addColorStop(0.3, color);
    grad.addColorStop(1, hexToRgba(color, 0.95));

    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#eab308'; // Gold metal rim
    ctx.lineWidth = width * 0.03;
    ctx.stroke();
    ctx.restore();
  });
}

function drawPixelShades(ctx: CanvasRenderingContext2D, width: number, color: string) {
  const pixel = width * 0.045;
  ctx.fillStyle = color;

  // Pixel layout
  const rows = [
    [-10, 10],
    [-9, 9],
    [-9, -1, 1, 9],
    [-8, -2, 2, 8],
    [-7, -3, 3, 7],
  ];

  rows.forEach((row, rIdx) => {
    const y = (rIdx - 2) * pixel;
    for (let c = row[0]; c <= row[1]; c++) {
      ctx.fillRect(c * pixel, y, pixel * 0.95, pixel * 0.95);
    }
    if (row.length === 4) {
      for (let c = row[2]; c <= row[3]; c++) {
        ctx.fillRect(c * pixel, y, pixel * 0.95, pixel * 0.95);
      }
    }
  });

  // White pixel glares
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-6 * pixel, -1 * pixel, pixel * 0.95, pixel * 0.95);
  ctx.fillRect(-5 * pixel, 0, pixel * 0.95, pixel * 0.95);
  ctx.fillRect(4 * pixel, -1 * pixel, pixel * 0.95, pixel * 0.95);
  ctx.fillRect(5 * pixel, 0, pixel * 0.95, pixel * 0.95);
}

function drawCyberVisor(ctx: CanvasRenderingContext2D, width: number, color: string) {
  const w = width * 0.58;
  const h = width * 0.28;

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 15;

  ctx.beginPath();
  ctx.moveTo(-w, -h * 0.5);
  ctx.lineTo(w, -h * 0.5);
  ctx.lineTo(w * 0.88, h * 0.5);
  ctx.lineTo(-w * 0.88, h * 0.5);
  ctx.closePath();

  ctx.fillStyle = hexToRgba(color, 0.7);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Scanlines
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  for (let i = -h * 0.3; i < h * 0.4; i += 6) {
    ctx.beginPath();
    ctx.moveTo(-w * 0.8, i);
    ctx.lineTo(w * 0.8, i);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * 3. FACE MASKS (সাইবার / ভেনিস / কার্নিভাল / অ্যানিমে মাস্ক)
 */
export function renderMask(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
  settings: FilterSettings
) {
  if (!settings.enabled || settings.opacity <= 0) return;

  const noseCenter = toPixel(landmarks[6], width, height);
  const leftCheek = toPixel(landmarks[234], width, height);
  const rightCheek = toPixel(landmarks[454], width, height);
  const forehead = toPixel(landmarks[10], width, height);

  const dx = rightCheek.x - leftCheek.x;
  const dy = rightCheek.y - leftCheek.y;
  const angle = Math.atan2(dy, dx);
  const faceWidth = Math.hypot(dx, dy);

  const alpha = (settings.opacity / 100) * (settings.intensity / 100);
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.translate(noseCenter.x, noseCenter.y);
  ctx.rotate(angle);

  const color = settings.color || '#06b6d4';
  const style = settings.subType || 'cyber_hud';

  if (style === 'venetian') {
    drawVenetianMask(ctx, faceWidth, color);
  } else if (style === 'kitsune') {
    drawKitsuneMask(ctx, faceWidth, color);
  } else {
    drawCyberHudMask(ctx, faceWidth, color);
  }

  ctx.restore();
}

function drawVenetianMask(ctx: CanvasRenderingContext2D, faceWidth: number, color: string) {
  const w = faceWidth * 0.52;
  const h = faceWidth * 0.32;

  ctx.save();
  ctx.fillStyle = hexToRgba(color, 0.85);
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 3;

  // Mask Silhouette
  ctx.beginPath();
  ctx.moveTo(0, h * 0.2);
  ctx.quadraticCurveTo(-w * 0.4, h * 0.6, -w, -h * 0.2);
  ctx.quadraticCurveTo(-w * 0.8, -h * 0.7, -w * 0.4, -h * 0.4);
  ctx.quadraticCurveTo(0, -h * 0.6, w * 0.4, -h * 0.4);
  ctx.quadraticCurveTo(w * 0.8, -h * 0.7, w, -h * 0.2);
  ctx.quadraticCurveTo(w * 0.4, h * 0.6, 0, h * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Eye Cutouts
  [-1, 1].forEach((dir) => {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(dir * w * 0.45, -h * 0.08, w * 0.2, h * 0.22, dir * 0.15, 0, Math.PI * 2);
    ctx.clip();
    ctx.clearRect(dir * w * 0.45 - w * 0.25, -h * 0.3, w * 0.5, h * 0.5);
    ctx.restore();
  });

  ctx.restore();
}

function drawKitsuneMask(ctx: CanvasRenderingContext2D, faceWidth: number, color: string) {
  const w = faceWidth * 0.45;
  const h = faceWidth * 0.4;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;

  // Fox Face Outline
  ctx.beginPath();
  ctx.moveTo(0, h * 0.6);
  ctx.lineTo(-w * 0.7, 0);
  ctx.lineTo(-w * 0.9, -h * 0.5);
  ctx.lineTo(-w * 0.4, -h * 0.8);
  ctx.lineTo(0, -h * 0.5);
  ctx.lineTo(w * 0.4, -h * 0.8);
  ctx.lineTo(w * 0.9, -h * 0.5);
  ctx.lineTo(w * 0.7, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Red shrine cheek markings
  ctx.fillStyle = color;
  [-1, 1].forEach((dir) => {
    ctx.beginPath();
    ctx.ellipse(dir * w * 0.5, h * 0.1, w * 0.18, h * 0.06, dir * 0.2, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawCyberHudMask(ctx: CanvasRenderingContext2D, faceWidth: number, color: string) {
  const w = faceWidth * 0.5;
  const h = faceWidth * 0.35;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2;

  // Targeting reticle & brackets
  [-1, 1].forEach((dir) => {
    const cx = dir * w * 0.5;
    const cy = -h * 0.15;
    const s = w * 0.22;

    ctx.beginPath();
    // Corner brackets
    ctx.moveTo(cx - s, cy - s * 0.5);
    ctx.lineTo(cx - s, cy - s);
    ctx.lineTo(cx - s * 0.5, cy - s);

    ctx.moveTo(cx + s * 0.5, cy - s);
    ctx.lineTo(cx + s, cy - s);
    ctx.lineTo(cx + s, cy - s * 0.5);

    ctx.moveTo(cx - s, cy + s * 0.5);
    ctx.lineTo(cx - s, cy + s);
    ctx.lineTo(cx - s * 0.5, cy + s);

    ctx.moveTo(cx + s * 0.5, cy + s);
    ctx.lineTo(cx + s, cy + s);
    ctx.lineTo(cx + s, cy + s * 0.5);
    ctx.stroke();

    // Center crosshair
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });

  // Cheek telemetry tech lines
  ctx.beginPath();
  ctx.moveTo(-w * 0.8, h * 0.3);
  ctx.lineTo(-w * 0.4, h * 0.3);
  ctx.lineTo(-w * 0.2, h * 0.5);

  ctx.moveTo(w * 0.8, h * 0.3);
  ctx.lineTo(w * 0.4, h * 0.3);
  ctx.lineTo(w * 0.2, h * 0.5);
  ctx.stroke();

  ctx.restore();
}

/**
 * 4. ROYAL CROWN (রাজমুকুট)
 */
export function renderGoldenCrown(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
  settings: FilterSettings
) {
  if (!settings.enabled || settings.opacity <= 0) return;

  const foreheadTop = toPixel(landmarks[10], width, height);
  const leftTemple = toPixel(landmarks[103], width, height);
  const rightTemple = toPixel(landmarks[338], width, height);

  const dx = rightTemple.x - leftTemple.x;
  const dy = rightTemple.y - leftTemple.y;
  const angle = Math.atan2(dy, dx);
  const headWidth = Math.hypot(dx, dy);

  const crownW = headWidth * 1.15 * (settings.intensity / 80);
  const crownH = crownW * 0.65;
  const alpha = (settings.opacity / 100) * (settings.intensity / 100);

  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.translate(foreheadTop.x, foreheadTop.y - crownH * 0.45);
  ctx.rotate(angle);

  const goldColor = settings.color || '#eab308';

  // Crown Gradient
  const grad = ctx.createLinearGradient(0, -crownH, 0, 0);
  grad.addColorStop(0, '#fef08a');
  grad.addColorStop(0.5, goldColor);
  grad.addColorStop(1, '#ca8a04');

  ctx.fillStyle = grad;
  ctx.strokeStyle = '#a16207';
  ctx.lineWidth = 2.5;

  // 5-Spike Crown Silhouette
  ctx.beginPath();
  const halfW = crownW / 2;
  ctx.moveTo(-halfW, 0);
  ctx.lineTo(-halfW * 0.9, -crownH * 0.6); // Peak 1
  ctx.lineTo(-halfW * 0.55, -crownH * 0.35); // Valley 1
  ctx.lineTo(-halfW * 0.3, -crownH * 0.85); // Peak 2
  ctx.lineTo(0, -crownH * 0.45); // Valley 2
  ctx.lineTo(0, -crownH); // Center High Peak 3
  ctx.lineTo(0, -crownH * 0.45);
  ctx.lineTo(halfW * 0.3, -crownH * 0.85); // Peak 4
  ctx.lineTo(halfW * 0.55, -crownH * 0.35); // Valley 3
  ctx.lineTo(halfW * 0.9, -crownH * 0.6); // Peak 5
  ctx.lineTo(halfW, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Jewels on Peaks
  const peaks = [
    { x: -halfW * 0.9, y: -crownH * 0.6, color: '#ef4444' }, // Ruby
    { x: -halfW * 0.3, y: -crownH * 0.85, color: '#3b82f6' }, // Sapphire
    { x: 0, y: -crownH, color: '#10b981' }, // Emerald center
    { x: halfW * 0.3, y: -crownH * 0.85, color: '#3b82f6' }, // Sapphire
    { x: halfW * 0.9, y: -crownH * 0.6, color: '#ef4444' }, // Ruby
  ];

  peaks.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, crownW * 0.04, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  ctx.restore();
}

/**
 * 5. NEON HORNS (নিওন হর্নস)
 */
export function renderNeonHorns(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
  settings: FilterSettings
) {
  if (!settings.enabled || settings.opacity <= 0) return;

  const leftTemple = toPixel(landmarks[103], width, height);
  const rightTemple = toPixel(landmarks[338], width, height);

  const dx = rightTemple.x - leftTemple.x;
  const dy = rightTemple.y - leftTemple.y;
  const angle = Math.atan2(dy, dx);
  const headWidth = Math.hypot(dx, dy);

  const hornSize = headWidth * 0.7 * (settings.intensity / 75);
  const alpha = (settings.opacity / 100) * (settings.intensity / 100);
  const color = settings.color || '#ef4444';

  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.shadowColor = color;
  ctx.shadowBlur = Math.max(8, settings.blur * 2 || 12);

  // Left Horn
  drawSingleHorn(ctx, leftTemple.x, leftTemple.y, hornSize, angle - 0.3, -1, color);
  // Right Horn
  drawSingleHorn(ctx, rightTemple.x, rightTemple.y, hornSize, angle + 0.3, 1, color);

  ctx.restore();
}

function drawSingleHorn(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  angle: number,
  dir: number,
  color: string
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(dir * size * 0.3, -size * 0.5, dir * size * 0.6, -size * 0.9);
  ctx.quadraticCurveTo(dir * size * 0.1, -size * 0.4, -dir * size * 0.18, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/**
 * 6. ANGEL HALO (অ্যাঞ্জেল হ্যালো)
 */
export function renderAngelHalo(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
  settings: FilterSettings
) {
  if (!settings.enabled || settings.opacity <= 0) return;

  const foreheadTop = toPixel(landmarks[10], width, height);
  const leftTemple = toPixel(landmarks[103], width, height);
  const rightTemple = toPixel(landmarks[338], width, height);

  const dx = rightTemple.x - leftTemple.x;
  const dy = rightTemple.y - leftTemple.y;
  const angle = Math.atan2(dy, dx);
  const headWidth = Math.hypot(dx, dy);

  const radiusX = headWidth * 0.7 * (settings.intensity / 80);
  const radiusY = radiusX * 0.32;
  const alpha = (settings.opacity / 100) * (settings.intensity / 100);
  const color = settings.color || '#fef08a';

  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.translate(foreheadTop.x, foreheadTop.y - radiusY * 3.5);
  ctx.rotate(angle);

  ctx.shadowColor = color;
  ctx.shadowBlur = Math.max(10, settings.blur * 2 || 15);

  ctx.strokeStyle = color;
  ctx.lineWidth = radiusX * 0.12;
  ctx.beginPath();
  ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Shiny Core Ring
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = radiusX * 0.04;
  ctx.stroke();

  ctx.restore();
}

/**
 * 7. FLOWER CROWN (ফুলের মুকুট)
 */
export function renderFlowerCrown(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
  settings: FilterSettings
) {
  if (!settings.enabled || settings.opacity <= 0) return;

  const foreheadTop = toPixel(landmarks[10], width, height);
  const leftForehead = toPixel(landmarks[103], width, height);
  const rightForehead = toPixel(landmarks[338], width, height);

  const dx = rightForehead.x - leftForehead.x;
  const dy = rightForehead.y - leftForehead.y;
  const angle = Math.atan2(dy, dx);
  const headWidth = Math.hypot(dx, dy);

  const alpha = (settings.opacity / 100) * (settings.intensity / 100);
  const flowerColor = settings.color || '#f43f5e';
  const flowerCount = 7;
  const flowerRadius = headWidth * 0.14 * (settings.intensity / 80);

  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.translate(foreheadTop.x, foreheadTop.y - flowerRadius * 0.4);
  ctx.rotate(angle);

  // Arch of flowers across forehead
  const span = headWidth * 0.95;
  for (let i = 0; i < flowerCount; i++) {
    const t = i / (flowerCount - 1);
    const fx = -span * 0.5 + t * span;
    const fy = Math.sin(t * Math.PI) * (-flowerRadius * 0.6);

    drawBlossom(ctx, fx, fy, flowerRadius, flowerColor, i % 2 === 0);
  }

  ctx.restore();
}

function drawBlossom(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  isAlt: boolean
) {
  ctx.save();
  ctx.translate(x, y);

  // 5 Petals
  const petalCount = 5;
  ctx.fillStyle = isAlt ? color : '#f472b6';
  for (let p = 0; p < petalCount; p++) {
    const a = (p / petalCount) * Math.PI * 2;
    const px = Math.cos(a) * (radius * 0.65);
    const py = Math.sin(a) * (radius * 0.65);

    ctx.beginPath();
    ctx.arc(px, py, radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Golden Flower Center
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * 8. HEART STICKERS (হার্ট স্টিকার)
 */
export function renderHeartBlush(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
  settings: FilterSettings
) {
  if (!settings.enabled || settings.opacity <= 0) return;

  const leftCheek = toPixel(landmarks[205], width, height);
  const rightCheek = toPixel(landmarks[425], width, height);
  const eyeSpan = Math.hypot(rightCheek.x - leftCheek.x, rightCheek.y - leftCheek.y);

  const heartSize = eyeSpan * 0.16 * (settings.intensity / 70);
  const alpha = (settings.opacity / 100) * (settings.intensity / 100);
  const color = settings.color || '#f43f5e';

  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);

  drawHeart(ctx, leftCheek.x, leftCheek.y, heartSize, -0.15, color);
  drawHeart(ctx, rightCheek.x, rightCheek.y, heartSize, 0.15, color);

  ctx.restore();
}

function drawHeart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rot: number,
  color: string
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.moveTo(0, size * 0.35);
  ctx.bezierCurveTo(-size * 0.5, -size * 0.4, -size, size * 0.2, 0, size);
  ctx.bezierCurveTo(size, size * 0.2, size * 0.5, -size * 0.4, 0, size * 0.35);
  ctx.fill();

  // Glint
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.arc(-size * 0.22, 0, size * 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * 9. STAR FRECKLES (স্টার ফ্রেক্লস)
 */
export function renderStarFreckles(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
  settings: FilterSettings
) {
  if (!settings.enabled || settings.opacity <= 0) return;

  const noseBridge = toPixel(landmarks[168], width, height);
  const leftCheek = toPixel(landmarks[116], width, height);
  const rightCheek = toPixel(landmarks[345], width, height);

  const span = Math.hypot(rightCheek.x - leftCheek.x, rightCheek.y - leftCheek.y);
  const starBase = span * 0.05 * (settings.intensity / 75);
  const alpha = (settings.opacity / 100) * (settings.intensity / 100);
  const color = settings.color || '#facc15';

  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);

  // Constellation pattern across cheeks and bridge
  const stars = [
    { x: noseBridge.x, y: noseBridge.y + 5, s: 1.2 },
    { x: (noseBridge.x + leftCheek.x) / 2, y: leftCheek.y - 10, s: 0.9 },
    { x: (noseBridge.x + rightCheek.x) / 2, y: rightCheek.y - 10, s: 0.9 },
    { x: leftCheek.x, y: leftCheek.y, s: 1.1 },
    { x: rightCheek.x, y: rightCheek.y, s: 1.1 },
    { x: leftCheek.x + 12, y: leftCheek.y + 12, s: 0.7 },
    { x: rightCheek.x - 12, y: rightCheek.y + 12, s: 0.7 },
  ];

  stars.forEach((st) => {
    drawFourPointStar(ctx, st.x, st.y, starBase * st.s, color);
  });

  ctx.restore();
}

function drawFourPointStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;

  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    const midA = a + Math.PI / 4;
    ctx.lineTo(Math.cos(midA) * (radius * 0.28), Math.sin(midA) * (radius * 0.28));
  }
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
