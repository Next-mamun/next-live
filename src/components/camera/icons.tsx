import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
  color?: string;
}

// Sleek luxury lipstick bullet
export const LipstickIcon: React.FC<IconProps> = ({ className = '', size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Angled lipstick bullet */}
    <path d="M10 2.5C10 2.5 10.8 2 12.2 2C13.8 2 14.5 3.2 14.5 5.5L14.5 8H9.5L9.5 5C9.5 3.5 10 2.5 10 2.5Z" fill={color} fillOpacity="0.85" />
    <path d="M10 2.5L14.5 5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    {/* Metal neck */}
    <rect x="8.5" y="8" width="7" height="4" rx="0.8" fill={color} fillOpacity="0.4" stroke={color} strokeWidth="1.2" />
    {/* Lower casing */}
    <rect x="7.5" y="12" width="9" height="10" rx="1.5" stroke={color} strokeWidth="1.5" />
    <line x1="7.5" y1="14.5" x2="16.5" y2="14.5" stroke={color} strokeWidth="1.2" />
  </svg>
);

// Cosmetic blush compact with powder swirl
export const BlushIcon: React.FC<IconProps> = ({ className = '', size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" />
    <circle cx="12" cy="12" r="6" stroke={color} strokeWidth="1.2" strokeDasharray="2 2" />
    <circle cx="12" cy="12" r="3.5" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1.2" />
    <path d="M17.5 6.5C18.5 7.5 19 9 19 12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// Precision winged eyeliner pen tip & stroke
export const EyelinerIcon: React.FC<IconProps> = ({ className = '', size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Precision applicator tip */}
    <path d="M18.5 3.5L20.5 5.5L14 12L12 10L18.5 3.5Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M12 10L10 14L14 12L12 10Z" fill={color} fillOpacity="0.8" />
    <path d="M10 14L8 16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    {/* Dynamic sweeping winged stroke */}
    <path d="M3 19C6 19 9.5 18 12.5 16C15.5 14 18 11.5 21 8" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// High-end eyeshadow compact palette
export const EyeshadowIcon: React.FC<IconProps> = ({ className = '', size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="3" y="4" width="18" height="16" rx="3" stroke={color} strokeWidth="1.5" />
    {/* 4 pigment pans */}
    <rect x="5.5" y="6.5" width="5.5" height="5.5" rx="1.5" fill={color} fillOpacity="0.75" />
    <rect x="13" y="6.5" width="5.5" height="5.5" rx="1.5" fill={color} fillOpacity="0.4" />
    <rect x="5.5" y="13" width="5.5" height="4.5" rx="1.5" fill={color} fillOpacity="0.25" />
    <rect x="13" y="13" width="5.5" height="4.5" rx="1.5" fill={color} fillOpacity="0.55" />
  </svg>
);

// Studio Beauty Smoothing / Radiant Skin
export const BeautySmoothIcon: React.FC<IconProps> = ({ className = '', size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Radiant primary sparkle */}
    <path d="M12 2L13.8 8.2L20 10L13.8 11.8L12 18L10.2 11.8L4 10L10.2 8.2L12 2Z" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    {/* Soft secondary stars */}
    <path d="M18.5 15.5L19.5 18L22 19L19.5 20L18.5 22.5L17.5 20L15 19L17.5 18L18.5 15.5Z" fill={color} fillOpacity="0.8" />
    <circle cx="6" cy="18" r="1.5" fill={color} />
  </svg>
);

// Stylized Cat Ears / Whisker Silhouette
export const CatEarsIcon: React.FC<IconProps> = ({ className = '', size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Left ear */}
    <path d="M4 11L6 4L11 8" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 7.5L7 5.5L9.5 7.5" fill={color} fillOpacity="0.4" />
    {/* Right ear */}
    <path d="M20 11L18 4L13 8" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 7.5L17 5.5L14.5 7.5" fill={color} fillOpacity="0.4" />
    {/* Whisker & nose accent */}
    <path d="M11 15L12 16.5L13 15" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 15L2 14M7 16.5L2.5 17.5M17 15L22 14M17 16.5L21.5 17.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

// Modern 3D Sunglasses / Cyber Visor
export const SunglassesIcon: React.FC<IconProps> = ({ className = '', size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M2 9.5C4 9.5 9.5 9 10.5 10C11.5 11 11.5 12.5 11 15.5C10.5 18 6.5 18.5 4.5 17.5C2.5 16.5 2 13 2 9.5Z" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1.5" />
    <path d="M22 9.5C20 9.5 14.5 9 13.5 10C12.5 11 12.5 12.5 13 15.5C13.5 18 17.5 18.5 19.5 17.5C21.5 16.5 22 13 22 9.5Z" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1.5" />
    {/* Brow bridge line */}
    <path d="M2 9.5H22" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    {/* Specular glint on left lens */}
    <line x1="4.5" y1="12" x2="6.5" y2="15" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.8" />
  </svg>
);

// Cyber Masquerade / Neon Face Mask
export const CyberMaskIcon: React.FC<IconProps> = ({ className = '', size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M3 8C5.5 6.5 8.5 7 12 8.5C15.5 7 18.5 6.5 21 8C20 12 17 18 12 21C7 18 4 12 3 8Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M6 10.5C7.5 9.5 9.5 10 10.5 11.5C9 12.5 7.5 12.5 6 10.5Z" fill={color} fillOpacity="0.6" />
    <path d="M18 10.5C16.5 9.5 14.5 10 13.5 11.5C15 12.5 16.5 12.5 18 10.5Z" fill={color} fillOpacity="0.6" />
    <line x1="12" y1="13" x2="12" y2="18" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

// Floating Celestial Halo
export const AngelHaloIcon: React.FC<IconProps> = ({ className = '', size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <ellipse cx="12" cy="7" rx="8.5" ry="3.5" stroke={color} strokeWidth="1.8" />
    <ellipse cx="12" cy="7" rx="6" ry="2" stroke={color} strokeWidth="1" strokeDasharray="3 2" strokeOpacity="0.7" />
    {/* Divine rays */}
    <path d="M12 12V18M8.5 13L6.5 19M15.5 13L17.5 19" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.8" />
    <circle cx="12" cy="20" r="1" fill={color} />
  </svg>
);

// Sculpted Devil Horns
export const DevilHornsIcon: React.FC<IconProps> = ({ className = '', size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Left horn curved upwards & out */}
    <path d="M5 19C5 13 4 8 2 4C6 6 8.5 10.5 9 17" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 19C5 13 4 8 2 4C6 6 8.5 10.5 9 17Z" fill={color} fillOpacity="0.3" />
    {/* Right horn */}
    <path d="M19 19C19 13 20 8 22 4C18 6 15.5 10.5 15 17" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19 19C19 13 20 8 22 4C18 6 15.5 10.5 15 17Z" fill={color} fillOpacity="0.3" />
  </svg>
);

// Reset parameters icon
export const ResetIcon: React.FC<IconProps> = ({ className = '', size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M3 12A9 9 0 1 0 5.6 5.6L3 8" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 3V8H8" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Compare / Split view eye
export const CompareIcon: React.FC<IconProps> = ({ className = '', size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M1 12C2.5 7 6.5 4 12 4C17.5 4 21.5 7 23 12C21.5 17 17.5 20 12 20C6.5 20 2.5 17 1 12Z" stroke={color} strokeWidth="1.6" />
    <circle cx="12" cy="12" r="3.5" stroke={color} strokeWidth="1.6" />
    <path d="M12 4V20" stroke={color} strokeWidth="1.4" strokeDasharray="2 2" />
  </svg>
);
