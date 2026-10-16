import React from 'react';
import { FilterItemDef, FilterSettings } from './types';
import { ResetIcon } from './icons';
import { Sliders, Sparkles, Droplets, Eye, ChevronDown } from 'lucide-react';

interface AdjustmentDrawerProps {
  filter: FilterItemDef;
  settings: FilterSettings;
  onChange: (updated: FilterSettings) => void;
  onReset: () => void;
  onClose: () => void;
}

export const AdjustmentDrawer: React.FC<AdjustmentDrawerProps> = ({
  filter,
  settings,
  onChange,
  onReset,
  onClose,
}) => {
  const handleIntensityChange = (val: number) => {
    onChange({ ...settings, intensity: val });
  };

  const handleOpacityChange = (val: number) => {
    onChange({ ...settings, opacity: val });
  };

  const handleBlurChange = (val: number) => {
    onChange({ ...settings, blur: val });
  };

  const handleColorSelect = (c: string) => {
    onChange({ ...settings, color: c });
  };

  return (
    <div className="w-full bg-black/85 backdrop-blur-2xl border-t border-white/15 px-4 pt-3 pb-6 rounded-t-3xl shadow-2xl transition-all duration-200 text-white">
      {/* Drawer Handle & Header */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: settings.color }} />
          <span className="text-sm font-semibold tracking-wide text-white capitalize">{filter.name}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-gray-300">
            {filter.category}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-gray-300 hover:text-white bg-white/5 hover:bg-white/15 transition-colors border border-white/10"
            title="Reset parameters"
          >
            <ResetIcon size={13} />
            <span>Reset</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <ChevronDown size={18} />
          </button>
        </div>
      </div>

      {/* Sliders Grid */}
      <div className="space-y-3 mb-4">
        {/* Intensity */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-300 font-medium flex items-center gap-1.5">
              <Sparkles size={13} className="text-blue-400" /> Intensity
            </span>
            <span className="text-blue-400 font-bold text-[11px] tabular-nums">{settings.intensity}%</span>
          </div>
          <div className="relative flex items-center">
            <input
              type="range"
              min="0"
              max="100"
              value={settings.intensity}
              onChange={(e) => handleIntensityChange(Number(e.target.value))}
              className="w-full h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-[#1877F2]"
            />
          </div>
        </div>

        {/* Opacity */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-300 font-medium flex items-center gap-1.5">
              <Droplets size={13} className="text-purple-400" /> Opacity
            </span>
            <span className="text-purple-400 font-bold text-[11px] tabular-nums">{settings.opacity}%</span>
          </div>
          <div className="relative flex items-center">
            <input
              type="range"
              min="0"
              max="100"
              value={settings.opacity}
              onChange={(e) => handleOpacityChange(Number(e.target.value))}
              className="w-full h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
          </div>
        </div>

        {/* Blur / Feather */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-300 font-medium flex items-center gap-1.5">
              <Eye size={13} className="text-emerald-400" /> Softness
            </span>
            <span className="text-emerald-400 font-bold text-[11px] tabular-nums">{settings.blur}px</span>
          </div>
          <div className="relative flex items-center">
            <input
              type="range"
              min="0"
              max="20"
              value={settings.blur}
              onChange={(e) => handleBlurChange(Number(e.target.value))}
              className="w-full h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Color Shade Palette */}
      <div>
        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center justify-between">
          <span>Color Shades</span>
          <span className="text-[10px] text-gray-500 font-mono">{settings.color}</span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {filter.colorPalette.map((colorHex) => {
            const isSelected = settings.color.toLowerCase() === colorHex.toLowerCase();
            return (
              <button
                type="button"
                key={colorHex}
                onClick={() => handleColorSelect(colorHex)}
                className={`relative w-7 h-7 rounded-full shrink-0 transition-transform ${
                  isSelected ? 'scale-115 ring-2 ring-white ring-offset-2 ring-offset-black' : 'hover:scale-105 opacity-85 hover:opacity-100'
                }`}
                style={{ backgroundColor: colorHex }}
              />
            );
          })}

          {/* Custom Hex Color Picker */}
          <label
            className="relative w-7 h-7 rounded-full shrink-0 flex items-center justify-center cursor-pointer border border-white/20 bg-gradient-to-tr from-pink-500 via-purple-500 to-cyan-500 hover:scale-105 transition-transform"
            title="Custom Shade"
          >
            <input
              type="color"
              value={settings.color}
              onChange={(e) => handleColorSelect(e.target.value)}
              className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
