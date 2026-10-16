import { FilterItem } from './types';

export const MAKEUP_FILTERS: FilterItem[] = [
  {
    id: 'lipstick',
    name: 'Lipstick',
    banglaName: 'লিপস্টিক',
    category: 'makeup',
    icon: '💄',
    description: 'Dynamic Canvas 2D velvet lipstick with subtle gloss highlight',
    defaultSettings: {
      intensity: 85,
      opacity: 75,
      blur: 2,
      color: '#d62839', // Classic Ruby Red
      blendMode: 'multiply'
    },
    colorPalette: [
      '#d62839', // Ruby Red
      '#e63946', // Crimson Rose
      '#ff007f', // Rose Pink
      '#9d0208', // Deep Velvet Wine
      '#f77f00', // Warm Coral
      '#b56576', // Dusty Rose Nude
      '#6a040f', // Plum Berry
      '#ff758f', // Soft Blossom
    ]
  },
  {
    id: 'blush',
    name: 'Blush',
    banglaName: 'ব্লাশ / রুজ',
    category: 'makeup',
    icon: '🌸',
    description: 'Natural rosy radial glow on both cheeks',
    defaultSettings: {
      intensity: 70,
      opacity: 60,
      blur: 14,
      color: '#ff758f', // Rosy Pink
      blendMode: 'multiply'
    },
    colorPalette: [
      '#ff758f', // Sweet Pink
      '#ff99c8', // Baby Rose
      '#f4a261', // Peach Coral
      '#e07a5f', // Terracotta Warm
      '#e76f51', // Sunset Glow
      '#ff4d6d', // Vivid Blush
    ]
  },
  {
    id: 'eyeliner',
    name: 'Eyeliner',
    banglaName: 'আইলাইনার',
    category: 'makeup',
    icon: '👁️',
    description: 'Precision cat-eye winged eyeliner along upper lashline',
    defaultSettings: {
      intensity: 90,
      opacity: 85,
      blur: 0,
      color: '#111111', // Deep Black
      blendMode: 'source-over'
    },
    colorPalette: [
      '#111111', // Jet Black
      '#3a0ca3', // Midnight Blue
      '#4a154b', // Deep Plum
      '#3d348b', // Royal Indigo
      '#2b2d42', // Charcoal
      '#00f5d4', // Neon Cyan
    ]
  },
  {
    id: 'eyeshadow',
    name: 'Eyeshadow',
    banglaName: 'আইশ্যাডো',
    category: 'makeup',
    icon: '✨',
    description: 'Soft gradient eye crease shading with shimmering tone',
    defaultSettings: {
      intensity: 75,
      opacity: 65,
      blur: 8,
      color: '#c77dff', // Shimmer Lilac
      blendMode: 'multiply'
    },
    colorPalette: [
      '#c77dff', // Shimmer Lilac
      '#f72585', // Glam Magenta
      '#ffd166', // Golden Glow
      '#06d6a0', // Mint Jade
      '#b5838d', // Smokey Mauve
      '#7b2cbf', // Royal Violet
    ]
  },
  {
    id: 'beauty_smooth',
    name: 'Beauty Smooth',
    banglaName: 'বিউটি স্মুথ ও গ্লো',
    category: 'makeup',
    icon: '✨',
    description: 'Instant porcelain skin smoothing, tone radiance and soft focus',
    defaultSettings: {
      intensity: 65,
      opacity: 60,
      blur: 8,
      color: '#fff3ea', // Warm Radiance
      blendMode: 'screen'
    },
    colorPalette: [
      '#fff3ea', // Warm Radiance
      '#ffe5ec', // Rosy Fair
      '#faedcd', // Golden Warm
      '#e2ece9', // Cool Porcelain
    ]
  }
];

export const EFFECT_FILTERS: FilterItem[] = [
  {
    id: 'cat_face',
    name: 'Cat Face',
    banglaName: 'বিড়াল ফিল্টার',
    category: 'effects',
    icon: '🐱',
    description: 'Cute anime cat ears, whiskers and pink button nose with ear wiggle',
    defaultSettings: {
      intensity: 100,
      opacity: 95,
      blur: 0,
      color: '#ff8fa3', // Pink inner ears & nose
      blendMode: 'source-over'
    },
    colorPalette: [
      '#ff8fa3', // Cute Pink
      '#ffffff', // Pure White
      '#222222', // Black Cat
      '#fca311', // Ginger Cat
    ]
  },
  {
    id: 'sunglasses',
    name: '3D Glasses',
    banglaName: 'স্টাইলিশ সানগ্লাস',
    category: 'effects',
    icon: '🕶️',
    description: '3D Head-tracking aviator / cyberpunk sunglasses with lens reflection',
    defaultSettings: {
      intensity: 100,
      opacity: 90,
      blur: 0,
      color: '#111111', // Dark lens
      color2: '#f72585', // Neon rim / reflection
      blendMode: 'source-over'
    },
    colorPalette: [
      '#111111', // Classic Dark
      '#00f5d4', // Cyber Cyan
      '#f72585', // Neon Pink
      '#ffd166', // Gold Aviator
      '#7209b7', // Purple Mirror
    ]
  },
  {
    id: 'dog_face',
    name: 'Dog Filter',
    banglaName: 'কুকুর ফিল্টার',
    category: 'effects',
    icon: '🐶',
    description: 'Cute floppy puppy ears, button nose and tongue that extends when opening mouth!',
    defaultSettings: {
      intensity: 100,
      opacity: 95,
      blur: 0,
      color: '#c97a3e', // Golden retriever brown
      blendMode: 'source-over'
    },
    colorPalette: [
      '#c97a3e', // Golden Brown
      '#f3c053', // Sandy Pup
      '#ffffff', // Dalmation White
      '#4a3f35', // Chocolate
    ]
  },
  {
    id: 'flower_crown',
    name: 'Flower Crown',
    banglaName: 'ফুলের মুকুট',
    category: 'effects',
    icon: '👑',
    description: 'Ethereal bohemian flower crown on forehead with floating butterflies & petals',
    defaultSettings: {
      intensity: 100,
      opacity: 90,
      blur: 0,
      color: '#ff4d6d', // Red/Pink Roses
      blendMode: 'source-over'
    },
    colorPalette: [
      '#ff4d6d', // Rose Blossom
      '#ffb703', // Sunflower Gold
      '#9d4edd', // Lavender Violet
      '#ffffff', // White Jasmine
    ]
  },
  {
    id: 'cyber_mask',
    name: 'Cyber Mask',
    banglaName: 'সাইবার নিয়ন মাস্ক',
    category: 'effects',
    icon: '🤖',
    description: 'Futuristic glowing neon cyberpunk visor mask with circuit lines',
    defaultSettings: {
      intensity: 95,
      opacity: 85,
      blur: 4,
      color: '#00f5d4', // Neon Cyan
      blendMode: 'screen'
    },
    colorPalette: [
      '#00f5d4', // Neon Cyan
      '#f72585', // Cyber Magenta
      '#39ff14', // Electric Lime
      '#ffbe0b', // Solar Yellow
    ]
  },
  {
    id: 'bunny_ears',
    name: 'Bunny Ears',
    banglaName: 'খরগোশের কান',
    category: 'effects',
    icon: '🐰',
    description: 'Soft animated bunny ears, cute whiskers and twitching nose',
    defaultSettings: {
      intensity: 100,
      opacity: 95,
      blur: 0,
      color: '#ffcbf2', // Pastel Pink
      blendMode: 'source-over'
    },
    colorPalette: [
      '#ffcbf2', // Pastel Pink
      '#ffffff', // Snow White
      '#e0aaff', // Lavender
    ]
  },
  {
    id: 'golden_mask',
    name: 'Golden Mask',
    banglaName: 'ভেনিসিয়ান মাস্ক',
    category: 'effects',
    icon: '🎭',
    description: 'Intricate Venetian masquerade golden filigree lace eye mask',
    defaultSettings: {
      intensity: 95,
      opacity: 88,
      blur: 0,
      color: '#ffd700', // Venetian Gold
      blendMode: 'source-over'
    },
    colorPalette: [
      '#ffd700', // Bright Gold
      '#e5e5e5', // Silver Platinum
      '#111111', // Black Lace
      '#9d0208', // Royal Crimson
    ]
  },
  {
    id: 'glitter_stars',
    name: 'Glitter Stars',
    banglaName: 'চকচকে গ্লিটার ও স্টার',
    category: 'effects',
    icon: '⭐',
    description: 'Sparkling holographic stars and tear drops below the eyes',
    defaultSettings: {
      intensity: 90,
      opacity: 85,
      blur: 2,
      color: '#ffea00', // Sparkling Star Gold
      blendMode: 'screen'
    },
    colorPalette: [
      '#ffea00', // Sparkling Gold
      '#00ffff', // Diamond Cyan
      '#ff00ff', // Fairy Magenta
      '#ffffff', // Pure Crystal
    ]
  }
];

export const ALL_FILTERS: FilterItem[] = [...MAKEUP_FILTERS, ...EFFECT_FILTERS];
