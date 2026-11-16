/**
 * WebRTC and ICE Configuration Utility
 * Provides OS-specific ICE routing (Fast STUN for Android/Windows, STUN+TURN for iOS/Mac)
 */

export const getDynamicIceConfig = () => {
  const isIOS =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document);

  const fastIce = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ];

  const heavyIce = [
    ...fastIce,
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelay',
      credential: 'openrelay'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelay',
      credential: 'openrelay'
    }
  ];

  return {
    iceServers: heavyIce,
    iceCandidatePoolSize: isIOS ? 10 : 4
  };
};

/**
 * HD Audio MediaStream constraints
 */
export const HD_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000
};
