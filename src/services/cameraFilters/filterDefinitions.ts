import { FilterItemDef, FilterId, FilterSettings, PresetFilter } from '@/types/camera';

export const FILTER_DEFINITIONS: FilterItemDef[] = [
  // --- মেকআপ (Internal / Code-based Canvas Filters) ---
  {
    id: 'lipstick',
    name: 'Lipstick',
    nameBn: 'লিপস্টিক',
    category: 'makeup',
    icon: '💄',
    defaultSettings: {
      enabled: false,
      intensity: 75,
      opacity: 70,
      blur: 2,
      color: '#e11d48', // Rich Ruby Red
    },
    colorPalette: [
      '#e11d48', // Ruby Red
      '#dc2626', // Classic Red
      '#be123c', // Crimson
      '#881337', // Deep Wine
      '#ec4899', // Hot Pink
      '#f43f5e', // Coral Pink
      '#fb7185', // Peach Nude
      '#a21caf', // Plum Berry
      '#7e22ce', // Velvet Purple
      '#b45309', // Cinnamon Nude
    ],
  },
  {
    id: 'blush',
    name: 'Blush',
    nameBn: 'ব্লাশ',
    category: 'makeup',
    icon: '🌸',
    defaultSettings: {
      enabled: false,
      intensity: 60,
      opacity: 50,
      blur: 8,
      color: '#f43f5e', // Soft Coral Rose
    },
    colorPalette: [
      '#f43f5e', // Rose Coral
      '#ec4899', // Soft Pink
      '#fb7185', // Peachy Pink
      '#fb923c', // Peach Glow
      '#f87171', // Light Red
      '#e879f9', // Mauve Glow
      '#c084fc', // Lilac Soft
      '#ea580c', // Sun Bronzer
    ],
  },
  {
    id: 'eyeliner',
    name: 'Eyeliner',
    nameBn: 'আইলাইনার',
    category: 'makeup',
    icon: '👁️',
    defaultSettings: {
      enabled: false,
      intensity: 70,
      opacity: 90,
      blur: 0,
      color: '#09090b', // Jet Black
      subType: 'wing', // 'classic' | 'wing' | 'bold'
    },
    subTypes: [
      { id: 'classic', label: 'Classic', labelBn: 'ক্লাসিক' },
      { id: 'wing', label: 'Cat Wing', labelBn: 'ক্যাট উইং' },
      { id: 'bold', label: 'Bold Glam', labelBn: 'বোল্ড' },
    ],
    colorPalette: [
      '#09090b', // Jet Black
      '#27272a', // Soft Charcoal
      '#451a03', // Dark Espresso
      '#1e3a8a', // Midnight Navy
      '#065f46', // Forest Emerald
      '#581c87', // Royal Plum
    ],
  },
  {
    id: 'eyeshadow',
    name: 'Eyeshadow',
    nameBn: 'আইশ্যাডো',
    category: 'makeup',
    icon: '✨',
    defaultSettings: {
      enabled: false,
      intensity: 65,
      opacity: 60,
      blur: 6,
      color: '#9333ea', // Royal Purple
    },
    colorPalette: [
      '#9333ea', // Shimmer Purple
      '#f59e0b', // Golden Bronze
      '#ec4899', // Rose Pink
      '#f97316', // Sunset Warm
      '#8b5cf6', // Soft Violet
      '#06b6d4', // Aqua Cyan
      '#10b981', // Emerald Mint
      '#64748b', // Smokey Gray
    ],
  },
  {
    id: 'smoothing',
    name: 'Beauty Smooth',
    nameBn: 'বিউটি স্মুথ',
    category: 'makeup',
    icon: '✨',
    defaultSettings: {
      enabled: false,
      intensity: 65,
      opacity: 55,
      blur: 5,
      color: '#fed7aa', // Warm Porcelain Glow
    },
    colorPalette: [
      '#fed7aa', // Porcelain Glow
      '#ffedd5', // Fair Radiance
      '#fde047', // Golden Sunlight
      '#fbcfe8', // Rosy Soft
      '#fdba74', // Warm Tan
    ],
  },

  // --- ইফেক্ট (External Assets / 3D & Vector Overlays) ---
  {
    id: 'cat_face',
    name: 'Cat Ears & Face',
    nameBn: 'বিড়াল ফিল্টার',
    category: 'effects',
    icon: '🐱',
    defaultSettings: {
      enabled: false,
      intensity: 80,
      opacity: 95,
      blur: 0,
      color: '#f43f5e', // Pink accents
      subType: 'cute_cat',
    },
    subTypes: [
      { id: 'cute_cat', label: 'Cute Pink Cat', labelBn: 'গোলাপি বিড়াল' },
      { id: 'black_cat', label: 'Mystic Black', labelBn: 'কালো বিড়াল' },
      { id: 'anime_neko', label: 'Anime Neko', labelBn: 'অ্যানিমে নেকো' },
    ],
    colorPalette: [
      '#f43f5e', // Cute Pink
      '#18181b', // Midnight Black
      '#f97316', // Orange Tabby
      '#a855f7', // Mystic Violet
      '#38bdf8', // Cyber Cyan
    ],
  },
  {
    id: 'sunglasses',
    name: '3D Glasses',
    nameBn: 'সানগ্লাস',
    category: 'effects',
    icon: '🕶️',
    defaultSettings: {
      enabled: false,
      intensity: 75,
      opacity: 95,
      blur: 0,
      color: '#09090b', // Black frame/tint
      subType: 'aviator',
    },
    subTypes: [
      { id: 'aviator', label: 'Cool Aviator', labelBn: 'অ্যাভিয়েটর' },
      { id: 'pixel', label: 'Thug Pixel', labelBn: 'পিক্সেল শেডস' },
      { id: 'round', label: 'Retro Round', labelBn: 'রেট্রো গোল' },
      { id: 'cyber', label: 'Cyber Visor', labelBn: 'সাইবার ভাইজার' },
    ],
    colorPalette: [
      '#09090b', // Pitch Black
      '#d97706', // Gold Frame
      '#dc2626', // Crimson Red
      '#2563eb', // Ocean Blue
      '#10b981', // Neon Green
      '#ec4899', // Hot Pink
    ],
  },
  {
    id: 'cyber_mask',
    name: 'Face Mask',
    nameBn: 'ফেস মাস্ক',
    category: 'effects',
    icon: '🎭',
    defaultSettings: {
      enabled: false,
      intensity: 80,
      opacity: 90,
      blur: 0,
      color: '#06b6d4', // Cyber Cyan
      subType: 'cyber_hud',
    },
    subTypes: [
      { id: 'cyber_hud', label: 'Cyber HUD', labelBn: 'সাইবার এইচইউডি' },
      { id: 'venetian', label: 'Venice Gold', labelBn: 'ভেনিস মাস্ক' },
      { id: 'kitsune', label: 'Fox Kitsune', labelBn: 'কিটসুনে ফক্স' },
    ],
    colorPalette: [
      '#06b6d4', // Cyber Cyan
      '#eab308', // Venetian Gold
      '#ec4899', // Neon Magenta
      '#10b981', // Matrix Green
      '#f43f5e', // Kitsune Red
      '#6366f1', // Ultra Violet
    ],
  },
  {
    id: 'golden_crown',
    name: 'Royal Crown',
    nameBn: 'রাজমুকুট',
    category: 'effects',
    icon: '👑',
    defaultSettings: {
      enabled: false,
      intensity: 85,
      opacity: 100,
      blur: 0,
      color: '#eab308', // Royal Gold
    },
    colorPalette: [
      '#eab308', // Pure Gold
      '#e2e8f0', // Silver Platinum
      '#ec4899', // Princess Pink
      '#6366f1', // Royal Amethyst
    ],
  },
  {
    id: 'neon_horns',
    name: 'Neon Horns',
    nameBn: 'নিওন হর্নস',
    category: 'effects',
    icon: '😈',
    defaultSettings: {
      enabled: false,
      intensity: 75,
      opacity: 95,
      blur: 4,
      color: '#ef4444', // Neon Devil Red
    },
    colorPalette: [
      '#ef4444', // Fiery Red
      '#a855f7', // Cyber Purple
      '#06b6d4', // Electric Blue
      '#22c55e', // Acid Green
      '#f43f5e', // Hot Pink
    ],
  },
  {
    id: 'angel_halo',
    name: 'Angel Halo',
    nameBn: 'অ্যাঞ্জেল হ্যালো',
    category: 'effects',
    icon: '😇',
    defaultSettings: {
      enabled: false,
      intensity: 80,
      opacity: 95,
      blur: 5,
      color: '#fef08a', // Heavenly Gold Glow
    },
    colorPalette: [
      '#fef08a', // Heavenly Gold
      '#67e8f9', // Celestial Blue
      '#f472b6', // Seraph Pink
      '#ffffff', // Pure Light
    ],
  },
  {
    id: 'flower_crown',
    name: 'Flower Crown',
    nameBn: 'ফুলের মুকুট',
    category: 'effects',
    icon: '🌺',
    defaultSettings: {
      enabled: false,
      intensity: 80,
      opacity: 95,
      blur: 0,
      color: '#f43f5e', // Floral Rose
    },
    colorPalette: [
      '#f43f5e', // Rose Coral
      '#fbbf24', // Sunflower Yellow
      '#a855f7', // Lavender Blossom
      '#34d399', // Spring Garden
    ],
  },
  {
    id: 'heart_blush',
    name: 'Heart Stickers',
    nameBn: 'হার্ট স্টিকার',
    category: 'effects',
    icon: '💖',
    defaultSettings: {
      enabled: false,
      intensity: 70,
      opacity: 90,
      blur: 0,
      color: '#f43f5e', // Romantic Heart Pink
    },
    colorPalette: [
      '#f43f5e', // Heart Pink
      '#ef4444', // Passion Red
      '#ec4899', // Magenta Glow
      '#a855f7', // Purple Romance
    ],
  },
  {
    id: 'star_freckles',
    name: 'Star Freckles',
    nameBn: 'স্টার ফ্রেক্লস',
    category: 'effects',
    icon: '⭐',
    defaultSettings: {
      enabled: false,
      intensity: 75,
      opacity: 90,
      blur: 0,
      color: '#facc15', // Sparkling Gold Stars
    },
    colorPalette: [
      '#facc15', // Gold Stardust
      '#38bdf8', // Blue Nebula
      '#f472b6', // Pink Sparkles
      '#e2e8f0', // Diamond Silver
    ],
  },
];

export const PRESET_FILTERS: PresetFilter[] = [
  {
    id: 'none',
    name: 'Normal',
    nameBn: 'স্বাভাবিক',
    icon: '🚫',
    description: 'No filters applied',
    filters: {},
  },
  {
    id: 'natural_glam',
    name: 'Soft Glam',
    nameBn: 'সফট গ্ল্যাম',
    icon: '✨',
    description: 'Subtle lipstick, natural cheek blush & skin smoothing',
    filters: {
      lipstick: { enabled: true, color: '#f43f5e', opacity: 60, intensity: 70, blur: 2 },
      blush: { enabled: true, color: '#fb7185', opacity: 45, intensity: 55, blur: 8 },
      smoothing: { enabled: true, opacity: 50, intensity: 60, blur: 4 },
    },
  },
  {
    id: 'cat_cute',
    name: 'Cute Neko',
    nameBn: 'কিউট বিড়াল',
    icon: '🐱',
    description: 'Cat ears, nose, whiskers & rosy peach blush',
    filters: {
      cat_face: { enabled: true, color: '#f43f5e', opacity: 95, intensity: 85, subType: 'cute_cat' },
      blush: { enabled: true, color: '#fb7185', opacity: 60, intensity: 65, blur: 6 },
      lipstick: { enabled: true, color: '#fb7185', opacity: 50, intensity: 65, blur: 2 },
    },
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    nameBn: 'সাইবারপাঙ্ক',
    icon: '🕶️',
    description: 'Neon sunglasses & cyberpunk glow',
    filters: {
      sunglasses: { enabled: true, color: '#06b6d4', opacity: 95, intensity: 80, subType: 'cyber' },
      eyeliner: { enabled: true, color: '#065f46', opacity: 80, intensity: 75, subType: 'wing' },
    },
  },
  {
    id: 'royal_queen',
    name: 'Royal Queen',
    nameBn: 'রয়েল কুইন',
    icon: '👑',
    description: 'Golden crown, ruby lips, bold winged eyeliner & stardust',
    filters: {
      golden_crown: { enabled: true, color: '#eab308', opacity: 100, intensity: 85 },
      lipstick: { enabled: true, color: '#dc2626', opacity: 80, intensity: 80, blur: 1 },
      eyeliner: { enabled: true, color: '#09090b', opacity: 95, intensity: 80, subType: 'wing' },
      smoothing: { enabled: true, opacity: 55, intensity: 65, blur: 5 },
    },
  },
  {
    id: 'angel_glow',
    name: 'Angel Glow',
    nameBn: 'অ্যাঞ্জেল গ্লো',
    icon: '😇',
    description: 'Floating golden halo, star freckles and sweet blush',
    filters: {
      angel_halo: { enabled: true, color: '#fef08a', opacity: 95, intensity: 85, blur: 6 },
      star_freckles: { enabled: true, color: '#facc15', opacity: 90, intensity: 75 },
      blush: { enabled: true, color: '#f472b6', opacity: 50, intensity: 60, blur: 7 },
    },
  },
  {
    id: 'devil_horns',
    name: 'Devil Horns',
    nameBn: 'ডেভিল হর্নস',
    icon: '😈',
    description: 'Glowing neon devil horns and dark wine lips',
    filters: {
      neon_horns: { enabled: true, color: '#ef4444', opacity: 95, intensity: 80, blur: 4 },
      lipstick: { enabled: true, color: '#881337', opacity: 85, intensity: 80, blur: 1 },
      eyeliner: { enabled: true, color: '#09090b', opacity: 95, intensity: 85, subType: 'bold' },
    },
  },
];

export const INITIAL_FILTER_STATE: Record<FilterId, FilterSettings> = FILTER_DEFINITIONS.reduce(
  (acc, def) => {
    acc[def.id] = { ...def.defaultSettings };
    return acc;
  },
  {} as Record<FilterId, FilterSettings>
);
