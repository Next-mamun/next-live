import React, { useEffect, useState } from 'react';
import {
  getCachedNextoPosterSync,
  getStaticNextoSnapshot,
  NextoRobotMode,
} from '@/lib/nextoModel';
import { useTheme } from '@/contexts/AuthContext';

interface NextoRobotStaticProps {
  size?: number;
  className?: string;
  forceMode?: NextoRobotMode;
}

export const NextoRobot2DSvg: React.FC<{ size?: number; className?: string; animated?: boolean }> = ({
  size = 24,
  className = '',
  animated = false,
}) => (
  <svg
    viewBox="0 0 1024 1024"
    width={size}
    height={size}
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Nexto 2D Robot"
    className={`select-none shrink-0 ${className}`}
  >
    <defs>
      <linearGradient id="nexto2dGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#5ee0fd" />
        <stop offset="100%" stopColor="#258be7" />
      </linearGradient>
      {animated && (
        <style>
          {`
            .nexto2d-eye { animation: nexto2dBlink 3s infinite; transform-origin: center; }
            @keyframes nexto2dBlink {
              0%, 90% { opacity: 1; }
              95% { opacity: 0; }
              100% { opacity: 1; }
            }
          `}
        </style>
      )}
    </defs>

    {/* BODY */}
    <ellipse cx="512" cy="600" rx="230" ry="280" fill="url(#nexto2dGrad)" />

    {/* ARMS */}
    <ellipse cx="300" cy="610" rx="50" ry="100" fill="url(#nexto2dGrad)" />
    <ellipse cx="720" cy="610" rx="50" ry="100" fill="url(#nexto2dGrad)" />

    {/* CHEST */}
    <rect x="400" y="540" width="220" height="120" rx="20" fill="#0c1b2c" />
    <text x="425" y="615" fontSize="48" fill="#ffffff" fontFamily="Arial">
      ▶ Next
    </text>

    {/* HEAD */}
    <ellipse cx="512" cy="320" rx="220" ry="200" fill="url(#nexto2dGrad)" />

    {/* EYES */}
    <ellipse className={animated ? 'nexto2d-eye' : ''} cx="440" cy="260" rx="35" ry="35" fill="#000" />
    <ellipse className={animated ? 'nexto2d-eye' : ''} cx="585" cy="260" rx="35" ry="35" fill="#000" />

    {/* SMILE */}
    <path d="M450,330 Q512,380 575,330" fill="#d21c2c" />

    {/* CHEEKS */}
    <circle cx="375" cy="310" r="30" fill="#ff7ea8" opacity=".8" />
    <circle cx="650" cy="310" r="30" fill="#ff7ea8" opacity=".8" />

    {/* ANTENNAS */}
    <line x1="400" y1="170" x2="360" y2="100" stroke="#4ba3f5" strokeWidth="20" />
    <circle cx="360" cy="100" r="20" fill="#4ba3f5" />

    <line x1="620" y1="170" x2="660" y2="100" stroke="#4ba3f5" strokeWidth="20" />
    <circle cx="660" cy="100" r="20" fill="#4ba3f5" />
  </svg>
);

const NextoRobotStatic: React.FC<NextoRobotStaticProps> = ({
  size = 24,
  className = '',
  forceMode,
}) => {
  const { robotMode } = useTheme();
  const mode = forceMode || robotMode;
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(() => getCachedNextoPosterSync());

  useEffect(() => {
    if (mode === '2d' || snapshotUrl) return;
    let active = true;
    getStaticNextoSnapshot().then((url) => {
      if (active && url) {
        setSnapshotUrl(url);
      }
    });
    return () => {
      active = false;
    };
  }, [mode, snapshotUrl]);

  if (mode === '2d') {
    return <NextoRobot2DSvg size={size} className={className} />;
  }

  if (snapshotUrl) {
    return (
      <img
        src={snapshotUrl}
        width={size}
        height={size}
        alt="Nexto 3D Robot"
        draggable={false}
        className={`object-contain select-none pointer-events-none shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full bg-gradient-to-br from-sky-400/40 to-blue-500/40 animate-pulse shrink-0 ${className}`}
      aria-label="Nexto 3D Robot"
    />
  );
};

export default NextoRobotStatic;
