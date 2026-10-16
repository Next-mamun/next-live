import React from 'react';
import { FilterCategory, FilterId, FilterSettings, PresetFilter } from '@/types/camera';
import { FILTER_DEFINITIONS, PRESET_FILTERS } from '@/services/cameraFilters/filterDefinitions';
import { Sliders, RotateCcw, Check, Sparkles, X, Palette } from 'lucide-react';

interface FilterAdjustmentPanelProps {
  selectedCategory: FilterCategory | 'presets';
  onSelectCategory: (category: FilterCategory | 'presets') => void;
  activeFilterId: FilterId | null;
  onSelectFilter: (id: FilterId) => void;
  filters: Record<FilterId, FilterSettings>;
  onUpdateFilter: (id: FilterId, updates: Partial<FilterSettings>) => void;
  onResetFilter: (id: FilterId) => void;
  onApplyPreset: (preset: PresetFilter) => void;
  activePresetId: string | null;
  onClearAll: () => void;
}

export const FilterAdjustmentPanel: React.FC<FilterAdjustmentPanelProps> = ({
  selectedCategory,
  onSelectCategory,
  activeFilterId,
  onSelectFilter,
  filters,
  onUpdateFilter,
  onResetFilter,
  onApplyPreset,
  activePresetId,
  onClearAll,
}) => {
  const currentDef = activeFilterId ? FILTER_DEFINITIONS.find((d) => d.id === activeFilterId) : null;
  const currentSettings = activeFilterId ? filters[activeFilterId] : null;

  const filteredDefs = FILTER_DEFINITIONS.filter((d) => d.category === selectedCategory);

  return (
    <div className="w-full bg-black/75 backdrop-blur-2xl border-t border-white/10 text-white rounded-t-3xl transition-all duration-300 pb-safe select-none shadow-2xl">
      {/* Top Handle / Slider Panel Drawer (Active Item Adjustments) */}
      {currentDef && currentSettings && (
        <div className="p-4 border-b border-white/10 bg-white/5 animate-in slide-in-from-bottom duration-200">
          <div className="max-w-xl mx-auto space-y-3">
            {/* Header of Active Item */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{currentDef.icon}</span>
                <div>
                  <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                    {currentDef.nameBn} <span className="text-xs text-gray-400 font-normal">({currentDef.name})</span>
                  </h4>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* On/Off Toggle */}
                <button
                  type="button"
                  onClick={() => onUpdateFilter(currentDef.id, { enabled: !currentSettings.enabled })}
                  className={`text-xs px-3 py-1.5 rounded-full font-bold transition-all flex items-center gap-1 ${
                    currentSettings.enabled
                      ? 'bg-pink-500 text-white shadow-md shadow-pink-500/30'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  {currentSettings.enabled ? 'অন (Active)' : 'অফ (Inactive)'}
                </button>

                {/* Reset Item */}
                <button
                  type="button"
                  onClick={() => onResetFilter(currentDef.id)}
                  title="Reset Filter"
                  className="p-1.5 rounded-full bg-white/10 text-gray-300 hover:text-white hover:bg-white/20 transition-colors"
                >
                  <RotateCcw size={15} />
                </button>

                {/* Close Drawer */}
                <button
                  type="button"
                  onClick={() => onSelectFilter(currentDef.id)}
                  className="p-1.5 rounded-full bg-white/10 text-gray-300 hover:text-white hover:bg-white/20 transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* SubTypes if any (e.g., Cat styles, Sunglasses variants, Eyeliner styles) */}
            {currentDef.subTypes && currentDef.subTypes.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
                {currentDef.subTypes.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => onUpdateFilter(currentDef.id, { subType: st.id, enabled: true })}
                    className={`px-3 py-1 text-xs rounded-xl whitespace-nowrap font-medium transition-all ${
                      currentSettings.subType === st.id
                        ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-sm'
                        : 'bg-white/10 text-gray-300 hover:bg-white/15'
                    }`}
                  >
                    {st.labelBn}
                  </button>
                ))}
              </div>
            )}

            {/* Real-time Sliders (Intensity, Opacity, Blur) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {/* 1. Intensity Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-gray-300">
                  <span>তীব্রতা / সাইজ (Intensity)</span>
                  <span className="font-bold text-pink-400">{currentSettings.intensity}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={currentSettings.intensity}
                  onChange={(e) =>
                    onUpdateFilter(currentDef.id, {
                      intensity: Number(e.target.value),
                      enabled: true,
                    })
                  }
                  className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
              </div>

              {/* 2. Opacity / গাঢ়ত্ব Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-gray-300">
                  <span>গাঢ়ত্ব (Opacity)</span>
                  <span className="font-bold text-pink-400">{currentSettings.opacity}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={currentSettings.opacity}
                  onChange={(e) =>
                    onUpdateFilter(currentDef.id, {
                      opacity: Number(e.target.value),
                      enabled: true,
                    })
                  }
                  className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
              </div>

              {/* 3. Blur / সফটনেস Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-gray-300">
                  <span>ব্লার / সফটনেস (Blur)</span>
                  <span className="font-bold text-pink-400">{currentSettings.blur}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={currentSettings.blur}
                  onChange={(e) =>
                    onUpdateFilter(currentDef.id, {
                      blur: Number(e.target.value),
                      enabled: true,
                    })
                  }
                  className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
              </div>
            </div>

            {/* Real-time Color Shade Palette */}
            {currentDef.colorPalette && currentDef.colorPalette.length > 0 && (
              <div className="pt-1">
                <div className="flex items-center justify-between text-[11px] text-gray-300 mb-1.5">
                  <span className="flex items-center gap-1">
                    <Palette size={12} className="text-pink-400" />
                    রং শেডস (Color Shades)
                  </span>
                  <label className="flex items-center gap-1 cursor-pointer text-pink-400 hover:text-pink-300 font-semibold text-[10px]">
                    <span>কাস্টম রং</span>
                    <input
                      type="color"
                      value={currentSettings.color}
                      onChange={(e) =>
                        onUpdateFilter(currentDef.id, { color: e.target.value, enabled: true })
                      }
                      className="w-4 h-4 opacity-0 absolute pointer-events-none"
                    />
                    <div
                      className="w-4 h-4 rounded-full border border-white/40 shadow-sm"
                      style={{ backgroundColor: currentSettings.color }}
                    />
                  </label>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
                  {currentDef.colorPalette.map((c) => {
                    const isSelected = currentSettings.color.toLowerCase() === c.toLowerCase();
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => onUpdateFilter(currentDef.id, { color: c, enabled: true })}
                        className={`w-7 h-7 rounded-full flex-shrink-0 transition-transform flex items-center justify-center relative shadow-sm ${
                          isSelected ? 'scale-115 ring-2 ring-white ring-offset-2 ring-offset-black' : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: c }}
                        title={c}
                      >
                        {isSelected && <Check size={13} className="text-white drop-shadow-md stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Categories Navigation Tabs */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2 bg-white/10 p-1 rounded-2xl">
          <button
            type="button"
            onClick={() => onSelectCategory('makeup')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
              selectedCategory === 'makeup'
                ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md shadow-pink-500/25'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            <span>💄</span>
            <span>মেকআপ</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectCategory('effects')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
              selectedCategory === 'effects'
                ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md shadow-purple-500/25'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            <span>✨</span>
            <span>ইফেক্ট</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectCategory('presets')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
              selectedCategory === 'presets'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/25'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            <span>⚡</span>
            <span>লুকস</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-gray-400 hover:text-rose-400 font-medium px-2 py-1 transition-colors flex items-center gap-1"
          title="Clear all active filters"
        >
          <RotateCcw size={12} />
          <span>রিসেট</span>
        </button>
      </div>

      {/* Item Carousel / Grid */}
      <div className="p-3">
        {selectedCategory === 'presets' ? (
          /* Presets Carousel */
          <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide py-1 px-1">
            {PRESET_FILTERS.map((preset) => {
              const isSelected = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onApplyPreset(preset)}
                  className={`flex flex-col items-center gap-1.5 min-w-[70px] p-2 rounded-2xl transition-all ${
                    isSelected
                      ? 'bg-gradient-to-b from-amber-500/30 to-amber-500/10 border border-amber-400/50 scale-105'
                      : 'bg-white/5 hover:bg-white/10 border border-transparent'
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-lg transition-transform ${
                      isSelected ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-black scale-105' : ''
                    } bg-gradient-to-tr from-gray-800 to-gray-700`}
                  >
                    {preset.icon}
                  </div>
                  <span className="text-[11px] font-semibold text-center whitespace-nowrap text-gray-200">
                    {preset.nameBn}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          /* Filter Items Carousel */
          <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide py-1 px-1">
            {filteredDefs.map((item) => {
              const itemSettings = filters[item.id];
              const isItemActive = itemSettings?.enabled;
              const isDrawerOpen = activeFilterId === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectFilter(item.id)}
                  className={`flex flex-col items-center gap-1.5 min-w-[72px] p-2 rounded-2xl transition-all relative ${
                    isDrawerOpen
                      ? 'bg-gradient-to-b from-pink-500/30 to-purple-500/10 border border-pink-400/50 scale-105'
                      : isItemActive
                      ? 'bg-white/15 border border-pink-500/40'
                      : 'bg-white/5 hover:bg-white/10 border border-transparent'
                  }`}
                >
                  {/* Active Indicator Badge */}
                  {isItemActive && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-pink-500 shadow-sm shadow-pink-500" />
                  )}

                  {/* Icon Circle */}
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-lg transition-transform ${
                      isItemActive
                        ? 'ring-2 ring-pink-500 ring-offset-2 ring-offset-black scale-105 bg-gradient-to-tr from-pink-600 to-purple-600'
                        : 'bg-gradient-to-tr from-gray-800 to-gray-700 text-gray-300'
                    }`}
                  >
                    {item.icon}
                  </div>

                  <span className="text-[11px] font-semibold text-center whitespace-nowrap text-gray-200">
                    {item.nameBn}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
