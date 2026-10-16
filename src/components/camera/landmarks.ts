import { FaceLandmarkPoint } from './types';

// MediaPipe 468/478 Landmark Indices
export const LANDMARKS = {
  // Lips
  upperLipOuter: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],
  upperLipInner: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308],
  lowerLipOuter: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291],
  lowerLipInner: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308],
  lipCenterTop: 0,
  lipCenterBottom: 17,
  mouthUpperInner: 13,
  mouthLowerInner: 14,

  // Cheeks
  leftCheekCenter: 205, // or 117 / 50
  rightCheekCenter: 425, // or 346 / 280
  leftCheekOuter: 234,
  rightCheekOuter: 454,

  // Eyes
  leftEyeOuterCorner: 33,
  leftEyeInnerCorner: 133,
  leftEyeUpperLash: [33, 246, 161, 160, 159, 158, 157, 173, 133],
  leftEyeLowerLash: [33, 7, 163, 144, 145, 153, 154, 155, 133],
  leftEyeCrease: [226, 247, 30, 29, 27, 28, 56, 190],
  leftIrisCenter: 468,

  rightEyeInnerCorner: 362,
  rightEyeOuterCorner: 263,
  rightEyeUpperLash: [362, 398, 384, 385, 386, 387, 388, 466, 263],
  rightEyeLowerLash: [362, 249, 390, 373, 374, 380, 381, 382, 263],
  rightEyeCrease: [446, 467, 260, 259, 257, 258, 286, 414],
  rightIrisCenter: 473,

  // Eyebrows
  leftEyebrow: [70, 63, 105, 66, 107],
  rightEyebrow: [336, 296, 334, 293, 300],

  // Nose
  noseTip: 1,
  noseBottom: 2,
  noseBridge: 168,
  noseTop: 6,
  leftNostril: 98,
  rightNostril: 327,

  // Forehead & Head Top
  foreheadCenter: 10,
  foreheadLeft: 109,
  foreheadRight: 338,
  templeLeft: 127,
  templeRight: 356,

  // Chin & Jaw
  chinBottom: 152,
  jawLeft: 58,
  jawRight: 288,

  // Face Oval boundary for skin smoothing
  faceOval: [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
    397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
    172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10
  ]
};

// Calculate 2D position in pixels from normalized landmark
export function getPoint(landmark: FaceLandmarkPoint, width: number, height: number): [number, number] {
  return [landmark.x * width, landmark.y * height];
}

// Calculate distance between two landmarks
export function getDistance(p1: FaceLandmarkPoint, p2: FaceLandmarkPoint, width: number, height: number): number {
  const dx = (p1.x - p2.x) * width;
  const dy = (p1.y - p2.y) * height;
  return Math.sqrt(dx * dx + dy * dy);
}

// Calculate head roll angle (in radians) using eye outer corners
export function getHeadRoll(landmarks: FaceLandmarkPoint[], width: number, height: number): number {
  const leftEye = landmarks[LANDMARKS.leftEyeOuterCorner];
  const rightEye = landmarks[LANDMARKS.rightEyeOuterCorner];
  if (!leftEye || !rightEye) return 0;
  const dx = (rightEye.x - leftEye.x) * width;
  const dy = (rightEye.y - leftEye.y) * height;
  return Math.atan2(dy, dx);
}

// Calculate mouth openness ratio (0.0 to 1.0+)
export function getMouthOpenness(landmarks: FaceLandmarkPoint[], width: number, height: number): number {
  const upper = landmarks[LANDMARKS.mouthUpperInner];
  const lower = landmarks[LANDMARKS.mouthLowerInner];
  const nose = landmarks[LANDMARKS.noseTip];
  const chin = landmarks[LANDMARKS.chinBottom];
  if (!upper || !lower || !nose || !chin) return 0;

  const mouthDist = getDistance(upper, lower, width, height);
  const faceDist = getDistance(nose, chin, width, height);
  if (faceDist <= 0) return 0;
  return mouthDist / faceDist;
}
