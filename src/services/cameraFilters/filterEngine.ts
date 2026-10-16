import { FilterId, FilterSettings } from '@/types/camera';
import {
  renderLipstick,
  renderBlush,
  renderEyeliner,
  renderEyeshadow,
  renderBeautySmooth,
} from './makeupRenderer';
import {
  renderCatFace,
  renderSunglasses,
  renderMask,
  renderGoldenCrown,
  renderNeonHorns,
  renderAngelHalo,
  renderFlowerCrown,
  renderHeartBlush,
  renderStarFreckles,
} from './effectRenderer';

/**
 * Executes full render pipeline on canvas overlay
 */
export function renderAllFilters(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
  filters: Record<FilterId, FilterSettings>
) {
  if (!landmarks || landmarks.length < 468) return;

  // 1. Base Beauty & Smooth
  if (filters.smoothing?.enabled) {
    try {
      renderBeautySmooth(ctx, landmarks, width, height, filters.smoothing);
    } catch (e) {
      console.warn('Beauty smooth render error:', e);
    }
  }

  // 2. Eyeshadow
  if (filters.eyeshadow?.enabled) {
    try {
      renderEyeshadow(ctx, landmarks, width, height, filters.eyeshadow);
    } catch (e) {
      console.warn('Eyeshadow render error:', e);
    }
  }

  // 3. Eyeliner
  if (filters.eyeliner?.enabled) {
    try {
      renderEyeliner(ctx, landmarks, width, height, filters.eyeliner);
    } catch (e) {
      console.warn('Eyeliner render error:', e);
    }
  }

  // 4. Blush
  if (filters.blush?.enabled) {
    try {
      renderBlush(ctx, landmarks, width, height, filters.blush);
    } catch (e) {
      console.warn('Blush render error:', e);
    }
  }

  // 5. Lipstick
  if (filters.lipstick?.enabled) {
    try {
      renderLipstick(ctx, landmarks, width, height, filters.lipstick);
    } catch (e) {
      console.warn('Lipstick render error:', e);
    }
  }

  // 6. Star Freckles / Heart Blush
  if (filters.star_freckles?.enabled) {
    try {
      renderStarFreckles(ctx, landmarks, width, height, filters.star_freckles);
    } catch (e) {
      console.warn('Star freckles render error:', e);
    }
  }

  if (filters.heart_blush?.enabled) {
    try {
      renderHeartBlush(ctx, landmarks, width, height, filters.heart_blush);
    } catch (e) {
      console.warn('Heart blush render error:', e);
    }
  }

  // 7. Face Masks
  if (filters.cyber_mask?.enabled) {
    try {
      renderMask(ctx, landmarks, width, height, filters.cyber_mask);
    } catch (e) {
      console.warn('Mask render error:', e);
    }
  }

  // 8. Sunglasses
  if (filters.sunglasses?.enabled) {
    try {
      renderSunglasses(ctx, landmarks, width, height, filters.sunglasses);
    } catch (e) {
      console.warn('Sunglasses render error:', e);
    }
  }

  // 9. Cat Face (Ears, nose, whiskers)
  if (filters.cat_face?.enabled) {
    try {
      renderCatFace(ctx, landmarks, width, height, filters.cat_face);
    } catch (e) {
      console.warn('Cat face render error:', e);
    }
  }

  // 10. Headpieces (Crowns, Horns, Halo, Flowers)
  if (filters.golden_crown?.enabled) {
    try {
      renderGoldenCrown(ctx, landmarks, width, height, filters.golden_crown);
    } catch (e) {
      console.warn('Golden crown render error:', e);
    }
  }

  if (filters.neon_horns?.enabled) {
    try {
      renderNeonHorns(ctx, landmarks, width, height, filters.neon_horns);
    } catch (e) {
      console.warn('Neon horns render error:', e);
    }
  }

  if (filters.angel_halo?.enabled) {
    try {
      renderAngelHalo(ctx, landmarks, width, height, filters.angel_halo);
    } catch (e) {
      console.warn('Angel halo render error:', e);
    }
  }

  if (filters.flower_crown?.enabled) {
    try {
      renderFlowerCrown(ctx, landmarks, width, height, filters.flower_crown);
    } catch (e) {
      console.warn('Flower crown render error:', e);
    }
  }
}
