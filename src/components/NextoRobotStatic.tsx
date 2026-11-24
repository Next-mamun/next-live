import React, { useEffect, useState } from 'react';
import { getStaticNextoSnapshot } from '@/lib/nextoModel';

interface NextoRobotStaticProps {
  size?: number;
  className?: string;
}

const NextoRobotStatic: React.FC<NextoRobotStaticProps> = ({
  size = 24,
  className = '',
}) => {
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getStaticNextoSnapshot().then((url) => {
      if (active && url) {
        setSnapshotUrl(url);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (snapshotUrl) {
    return (
      <img
        src={snapshotUrl}
        width={size}
        height={size}
        alt="Nexto Robot"
        draggable={false}
        className={`object-contain select-none pointer-events-none shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Nexto Robot"
      className={`select-none shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id="nextoStaticFallback" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#1877F2" />
        </linearGradient>
      </defs>
      <ellipse cx="512" cy="320" rx="220" ry="200" fill="url(#nextoStaticFallback)" />
      <ellipse cx="440" cy="260" rx="35" ry="35" fill="#000" />
      <ellipse cx="585" cy="260" rx="35" ry="35" fill="#000" />
      <path d="M450,330 Q512,380 575,330" fill="#d21c2c" />
      <ellipse cx="512" cy="600" rx="230" ry="280" fill="url(#nextoStaticFallback)" />
    </svg>
  );
};

export default NextoRobotStatic;
