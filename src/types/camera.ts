export type FilterCategory = 'makeup' | 'effects';

export type MakeupType = 
  | 'lipstick'
  | 'blush'
  | 'eyeliner'
  | 'eyeshadow'
  | 'smoothing';

export type EffectType = 
  | 'cat_face'
  | 'sunglasses'
  | 'cyber_mask'
  | 'golden_crown'
  | 'neon_horns'
  | 'angel_halo'
  | 'flower_crown'
  | 'heart_blush'
  | 'star_freckles';

export type FilterId = MakeupType | EffectType;

export interface FilterSettings {
  enabled: boolean;
  intensity: number; // 0 to 100
  opacity: number;   // 0 to 100
  blur: number;      // 0 to 20
  color: string;     // Hex color
  secondaryColor?: string;
  subType?: string;  // e.g. sunglasses style: 'aviator' | 'pixel' | 'round' | 'cyber'
}

export interface PresetFilter {
  id: string;
  name: string;
  nameBn: string;
  icon: string;
  description: string;
  filters: Partial<Record<FilterId, Partial<FilterSettings>>>;
}

export interface FilterItemDef {
  id: FilterId;
  name: string;
  nameBn: string;
  category: FilterCategory;
  icon: string;
  defaultSettings: FilterSettings;
  colorPalette: string[];
  subTypes?: { id: string; label: string; labelBn: string }[];
}
