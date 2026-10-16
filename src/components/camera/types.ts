export type FilterCategory = 'makeup' | 'effects';

export type MakeupFilterId = 'lipstick' | 'blush' | 'eyeliner' | 'eyeshadow' | 'beauty_smooth';
export type EffectFilterId = 'cat_ears' | 'sunglasses' | 'cyber_mask' | 'angel_halo' | 'devil_horns';
export type AnyFilterId = MakeupFilterId | EffectFilterId | 'none';

export interface FilterSettings {
  intensity: number; // 0 - 100
  opacity: number;   // 0 - 100
  blur: number;      // 0 - 20 (px)
  color: string;     // Hex color
  style?: string;    // Substyle or variant
}

export interface FilterItemDef {
  id: AnyFilterId;
  name: string;
  category: FilterCategory;
  description: string;
  defaultSettings: FilterSettings;
  colorPalette: string[];
}

export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
}
