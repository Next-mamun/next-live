import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Camera,
  Image as ImageIcon,
  Type,
  Smile,
  PenTool,
  Crop as CropIcon,
  Scissors,
  Volume2,
  VolumeX,
  Clock,
  Lock,
  Send,
  Palette,
  Trash2,
  RotateCcw,
  SlidersHorizontal,
  Check,
  Loader2,
} from 'lucide-react';
import Draggable from 'react-draggable';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import Cropper from 'react-easy-crop';
import { toast } from 'sonner';
import { CameraCapture } from '@/components/CameraCapture';
import { useAuth } from '@/contexts/AuthContext';
import { useUpload } from '@/contexts/UploadContext';
import { useContentFilter } from '@/hooks/useContentFilter';
import {
  StoryDrawPath,
  StoryEditMetadata,
  StoryFilterPreset,
  StoryStickerOverlay,
  StoryTextOverlay,
  StoryVisibility,
} from '@/types';
import {
  STATUS_BG_PRESETS,
  STATUS_DURATION_OPTIONS,
  STORY_FILTER_CSS,
  clampStatusDurationHours,
  createTextStatusDirect,
  getPrivacySummaryLabel,
  getSavedStatusPrivacy,
  saveStatusPrivacy,
} from '@/services/statusService';
import { StatusPrivacyModal } from './StatusPrivacyModal';

interface StatusCreatorModalProps {
  isOpen: boolean;
  initialMode?: 'picker' | 'text' | 'camera';
  onClose: () => void;
  onCreated?: () => void;
}

const DraggableSticker: React.FC<{
  sticker: StoryStickerOverlay;
  containerSize: { width: number; height: number };
  selected: boolean;
  onSelect: () => void;
  onMove: (id: string, xPct: number, yPct: number) => void;
}> = ({ sticker, containerSize, selected, onSelect, onMove }) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  return (
    <Draggable
      nodeRef={nodeRef}
      bounds="parent"
      position={{
        x: (sticker.x / 100) * containerSize.width,
        y: (sticker.y / 100) * containerSize.height,
      }}
      onStart={onSelect}
      onStop={(_, data) => {
        if (!containerSize.width || !containerSize.height) return;
        onMove(
          sticker.id,
          Math.max(5, Math.min(95, (data.x / containerSize.width) * 100)),
          Math.max(5, Math.min(95, (data.y / containerSize.height) * 100))
        );
      }}
    >
      <div
        ref={nodeRef}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        className={`absolute top-0 left-0 cursor-move select-none z-20 ${selected ? 'ring-2 ring-[#1877F2] rounded-xl' : ''}`}
      >
        <div
          style={{
            transform: 'translate(-50%, -50%)',
            fontSize: `${sticker.size}px`,
            lineHeight: 1,
          }}
          className="drop-shadow-lg p-1"
        >
          {sticker.emoji}
        </div>
      </div>
    </Draggable>
  );
};

const DraggableTextOverlay: React.FC<{
  item: StoryTextOverlay;
  containerSize: { width: number; height: number };
  selected: boolean;
  onSelect: () => void;
  onMove: (id: string, xPct: number, yPct: number) => void;
}> = ({ item, containerSize, selected, onSelect, onMove }) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  return (
    <Draggable
      nodeRef={nodeRef}
      bounds="parent"
      position={{
        x: (item.x / 100) * containerSize.width,
        y: (item.y / 100) * containerSize.height,
      }}
      onStart={onSelect}
      onStop={(_, data) => {
        if (!containerSize.width || !containerSize.height) return;
        onMove(
          item.id,
          Math.max(8, Math.min(92, (data.x / containerSize.width) * 100)),
          Math.max(8, Math.min(92, (data.y / containerSize.height) * 100))
        );
      }}
    >
      <div
        ref={nodeRef}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        className="absolute top-0 left-0 cursor-move select-none z-20 max-w-[85%]"
      >
        <div
          style={{
            transform: 'translate(-50%, -50%)',
            color: item.color,
            backgroundColor: item.bg || 'transparent',
            fontSize: `${item.size}px`,
          }}
          className={`font-black px-3 py-1 rounded-xl text-center drop-shadow-md break-words ${
            selected ? 'ring-2 ring-[#1877F2]' : ''
          }`}
        >
          {item.text}
        </div>
      </div>
    </Draggable>
  );
};

const QUICK_EMOJIS = ['❤️', '😂', '🔥', '🥳', '😍', '✨', '🙌', '💯', '🇧🇩', '😎'];

export const StatusCreatorModal: React.FC<StatusCreatorModalProps> = ({
  isOpen,
  initialMode = 'picker',
  onClose,
  onCreated,
}) => {
  const { currentUser } = useAuth();
  const { addUpload } = useUpload();
  const { scanFile, isScanning } = useContentFilter();

  const [mode, setMode] = useState<'picker' | 'text' | 'editor'>('picker');
  const [showCamera, setShowCamera] = useState(false);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [mediaSource, setMediaSource] = useState<string>('');
  const [rawFile, setRawFile] = useState<File | null>(null);

  // Text status states
  const [textStatusValue, setTextStatusValue] = useState('');
  const [bgPresetId, setBgPresetId] = useState(STATUS_BG_PRESETS[0].id);
  const [fontStyle, setFontStyle] = useState<'bold' | 'sans' | 'serif' | 'mono'>('bold');

  // Shared Caption + Emoji + Edit Overlays (works for BOTH Photo & Video!)
  const [caption, setCaption] = useState('');
  const [filterPreset, setFilterPreset] = useState<StoryFilterPreset>('none');
  const [stickers, setStickers] = useState<StoryStickerOverlay[]>([]);
  const [texts, setTexts] = useState<StoryTextOverlay[]>([]);
  const [paths, setPaths] = useState<StoryDrawPath[]>([]);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);

  // Tool toggles
  const [activeTool, setActiveTool] = useState<'none' | 'draw' | 'text' | 'emoji' | 'filter' | 'trim'>('none');
  const [emojiTarget, setEmojiTarget] = useState<'sticker' | 'caption' | 'textStatus'>('sticker');
  const [brushColor, setBrushColor] = useState('#1877F2');
  const [newOverlayText, setNewOverlayText] = useState('');
  const [newOverlayColor, setNewOverlayColor] = useState('#ffffff');
  const [newOverlayBg, setNewOverlayBg] = useState<string>('rgba(0,0,0,0.45)');
  const [newOverlaySize, setNewOverlaySize] = useState(26);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  // Video trim & mute
  const [videoDuration, setVideoDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  // Crop for image
  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  // Privacy & Auto-delete Duration (24h default up to 7 days max!)
  const [visibility, setVisibility] = useState<StoryVisibility>('friends');
  const [allowedUserIds, setAllowedUserIds] = useState<string[]>([]);
  const [excludedUserIds, setExcludedUserIds] = useState<string[]>([]);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [durationHours, setDurationHours] = useState<number>(24);

  const [isPublishing, setIsPublishing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 320, height: 480 });

  // Reset modal when opened
  useEffect(() => {
    if (!isOpen) return;
    const saved = getSavedStatusPrivacy(currentUser?.id);
    setVisibility(saved.visibility);
    setAllowedUserIds(saved.allowed_user_ids);
    setExcludedUserIds(saved.excluded_user_ids);
    setDurationHours(24);
    setCaption('');
    setTextStatusValue('');
    setStickers([]);
    setTexts([]);
    setPaths([]);
    setCurrentPath([]);
    setFilterPreset('none');
    setActiveTool('none');
    setSelectedStickerId(null);
    setSelectedTextId(null);
    setTrimStart(0);
    setTrimEnd(0);
    setVideoDuration(0);
    setIsMuted(false);
    setIsCropping(false);
    setRawFile(null);
    setMediaSource('');
    setIsPublishing(false);

    if (initialMode === 'camera') {
      setMode('picker');
      setShowCamera(true);
    } else if (initialMode === 'text') {
      setMode('text');
      setShowCamera(false);
    } else {
      setMode('picker');
      setShowCamera(false);
    }
  }, [isOpen, initialMode, currentUser?.id]);

  useEffect(() => {
    return () => {
      if (mediaSource && mediaSource.startsWith('blob:')) {
        URL.revokeObjectURL(mediaSource);
      }
    };
  }, [mediaSource]);

  useEffect(() => {
    if (!stageRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setContainerSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      }
    });
    obs.observe(stageRef.current);
    return () => obs.disconnect();
  }, [mode, mediaSource]);

  // Enforce live trim loop preview on video!
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || mediaType !== 'video' || !videoDuration) return;
    const endBound = trimEnd > trimStart ? trimEnd : videoDuration;
    const handleTimeUpdate = () => {
      if (vid.currentTime < trimStart || vid.currentTime >= endBound) {
        vid.currentTime = trimStart;
      }
    };
    vid.addEventListener('timeupdate', handleTimeUpdate);
    return () => vid.removeEventListener('timeupdate', handleTimeUpdate);
  }, [mediaType, videoDuration, trimStart, trimEnd]);

  const onCropComplete = useCallback((_: any, areaPx: any) => {
    setCroppedAreaPixels(areaPx);
  }, []);

  if (!isOpen) return null;

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const inputEl = e.target;
    if (!file) return;

    const isVid =
      file.type.startsWith('video/') ||
      /\.(mp4|mov|avi|mkv|webm|3gp|m4v)$/i.test(file.name);
    const isImg =
      file.type.startsWith('image/') ||
      /\.(jpg|jpeg|png|gif|webp|heic|bmp)$/i.test(file.name);

    if (!isVid && !isImg) {
      toast.error('Please pick a photo or video file.');
      return;
    }

    const safe = await scanFile(file, inputEl);
    if (!safe) return;

    if (mediaSource && mediaSource.startsWith('blob:')) {
      URL.revokeObjectURL(mediaSource);
    }
    const objUrl = URL.createObjectURL(file);
    setRawFile(file);
    setMediaType(isVid ? 'video' : 'image');
    setMediaSource(objUrl);
    setMode('editor');
  };

  const handleCameraCapture = (url: string, type: 'image' | 'video') => {
    setShowCamera(false);
    setRawFile(null);
    setMediaType(type);
    setMediaSource(url);
    setMode('editor');
  };

  const handleCropSave = async () => {
    if (!croppedAreaPixels || mediaType !== 'image') return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = mediaSource;
    await new Promise((resolve) => (img.onload = resolve));

    canvas.width = croppedAreaPixels.width;
    canvas.height = croppedAreaPixels.height;
    ctx.drawImage(
      img,
      croppedAreaPixels.x,
      croppedAreaPixels.y,
      croppedAreaPixels.width,
      croppedAreaPixels.height,
      0,
      0,
      croppedAreaPixels.width,
      croppedAreaPixels.height
    );
    const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setMediaSource(croppedDataUrl);
    setRawFile(null);
    setIsCropping(false);
  };

  const addStickerEmoji = (emoji: string) => {
    if (emojiTarget === 'caption') {
      setCaption((prev) => prev + emoji);
      setActiveTool('none');
      return;
    }
    if (emojiTarget === 'textStatus') {
      setTextStatusValue((prev) => prev + emoji);
      setActiveTool('none');
      return;
    }
    const id = `stk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setStickers((prev) => [...prev, { id, emoji, x: 50, y: 45, size: 46 }]);
    setSelectedStickerId(id);
    setSelectedTextId(null);
    setActiveTool('none');
  };

  const handleAddTextOverlay = () => {
    const clean = newOverlayText.trim();
    if (!clean) return;
    const id = `txt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setTexts((prev) => [
      ...prev,
      {
        id,
        text: clean,
        color: newOverlayColor,
        bg: newOverlayBg,
        size: newOverlaySize,
        x: 50,
        y: 35,
      },
    ]);
    setNewOverlayText('');
    setSelectedTextId(id);
    setSelectedStickerId(null);
    setActiveTool('none');
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (activeTool !== 'draw') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY : e.clientY;
    if (clientX === undefined || clientY === undefined) return;
    setCurrentPath([
      {
        x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
        y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
      },
    ]);
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (activeTool !== 'draw' || currentPath.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY : e.clientY;
    if (clientX === undefined || clientY === undefined) return;
    setCurrentPath((prev) => [
      ...prev,
      {
        x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
        y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
      },
    ]);
  };

  const handlePointerUp = () => {
    if (activeTool !== 'draw' || currentPath.length === 0) return;
    setPaths((prev) => [...prev, { color: brushColor, width: 4, points: currentPath }]);
    setCurrentPath([]);
  };

  const bakeImageEditsToDataUrl = async (): Promise<string> => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = mediaSource;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
    });

    const maxDim = 1600;
    const scaleDown = Math.min(1, maxDim / Math.max(img.width, img.height));
    const targetWidth = Math.round(img.width * scaleDown);
    const targetHeight = Math.round(img.height * scaleDown);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    if (filterPreset !== 'none' && STORY_FILTER_CSS[filterPreset]) {
      ctx.filter = STORY_FILTER_CSS[filterPreset];
    }
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    ctx.filter = 'none';

    const scaleFactor = targetHeight / Math.max(containerSize.height, 360);

    // Drawing paths
    paths.forEach((p) => {
      if (!p.points || p.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = (p.width || 4) * scaleFactor;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      p.points.forEach((pt, idx) => {
        const px = (pt.x / 100) * targetWidth;
        const py = (pt.y / 100) * targetHeight;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    });

    // Stickers / Emojis
    stickers.forEach((s) => {
      ctx.font = `${Math.round(s.size * scaleFactor)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.emoji, (s.x / 100) * targetWidth, (s.y / 100) * targetHeight);
    });

    // Text Overlays
    texts.forEach((t) => {
      const fSize = Math.round(t.size * scaleFactor);
      ctx.font = `800 ${fSize}px Inter, system-ui, sans-serif`;
      const cx = (t.x / 100) * targetWidth;
      const cy = (t.y / 100) * targetHeight;
      if (t.bg && t.bg !== 'transparent') {
        const metrics = ctx.measureText(t.text);
        const padX = 14 * scaleFactor;
        const padY = 8 * scaleFactor;
        const boxW = metrics.width + padX * 2;
        const boxH = fSize + padY * 2;
        ctx.fillStyle = t.bg;
        ctx.beginPath();
        ctx.roundRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH, 12 * scaleFactor);
        ctx.fill();
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, cx, cy);
    });

    return canvas.toDataURL('image/jpeg', 0.9);
  };

  const handlePublishStatus = async () => {
    if (!currentUser?.id) {
      toast.error('Please log in to share a status.');
      return;
    }

    if (visibility === 'only_share' && allowedUserIds.length === 0) {
      toast.error('Please select at least 1 person in Privacy settings.');
      setShowPrivacyModal(true);
      return;
    }

    const safeHours = clampStatusDurationHours(durationHours);
    setIsPublishing(true);

    try {
      saveStatusPrivacy(currentUser.id, {
        visibility,
        allowed_user_ids: allowedUserIds,
        excluded_user_ids: excludedUserIds,
      });

      const editMetadata: StoryEditMetadata = {
        filter: filterPreset,
        muted: isMuted,
        trimStart: mediaType === 'video' ? trimStart : 0,
        trimEnd: mediaType === 'video' ? trimEnd : 0,
        texts,
        stickers,
        paths,
      };

      if (mode === 'text') {
        if (!textStatusValue.trim()) {
          toast.error('Write something for your status.');
          setIsPublishing(false);
          return;
        }
        await createTextStatusDirect({
          user: currentUser,
          textContent: textStatusValue,
          bgStyle: bgPresetId,
          fontStyle,
          caption,
          visibility,
          allowedUserIds,
          excludedUserIds,
          durationHours: safeHours,
          editMetadata: stickers.length > 0 ? { stickers } : null,
        });
        toast.success(`Status posted! Auto-deletes after ${safeHours === 24 ? '24 hours' : `${safeHours / 24} days`}.`);
        onCreated?.();
        onClose();
        return;
      }

      // Photo or Video Status
      let uploadInput: File | string = rawFile || mediaSource;
      if (mediaType === 'image' && (filterPreset !== 'none' || stickers.length > 0 || texts.length > 0 || paths.length > 0 || !rawFile)) {
        uploadInput = await bakeImageEditsToDataUrl();
      }

      addUpload(uploadInput, 'story', {
        userId: currentUser.id,
        authorName: currentUser.display_name || currentUser.username || 'User',
        authorUsername: currentUser.username || 'user',
        authorAvatar: currentUser.avatar_url || '',
        authorVerified: Boolean(currentUser.is_verified),
        mediaType,
        caption,
        visibility,
        allowedUserIds,
        excludedUserIds,
        durationHours: safeHours,
        editMetadata: mediaType === 'video' ? editMetadata : null,
        skipModeration: Boolean(rawFile),
        onSuccess: () => {
          toast.success(`Status shared! Auto-deletes after ${safeHours === 24 ? '24 hours' : `${safeHours / 24} days`}.`);
          onCreated?.();
        },
      });

      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to publish status.');
    } finally {
      setIsPublishing(false);
    }
  };

  if (showCamera) {
    return (
      <CameraCapture
        title="Next Status Camera"
        onCapture={handleCameraCapture}
        onCancel={() => setShowCamera(false)}
      />
    );
  }

  if (isCropping && mediaType === 'image') {
    return (
      <div className="fixed inset-0 z-[1250] bg-black flex flex-col items-center justify-center p-4">
        <div className="relative w-full max-w-md h-[62vh] bg-gray-900 rounded-2xl overflow-hidden mb-5">
          <Cropper
            image={mediaSource}
            crop={crop}
            zoom={zoom}
            aspect={9 / 16}
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
          />
        </div>
        <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-400">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setIsCropping(false)}
              className="flex-1 py-2.5 rounded-xl bg-gray-800 text-white font-bold text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCropSave}
              className="flex-1 py-2.5 rounded-xl bg-[#1877F2] hover:bg-blue-600 text-white font-bold text-sm"
            >
              Apply Crop
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeBg = STATUS_BG_PRESETS.find((b) => b.id === bgPresetId) || STATUS_BG_PRESETS[0];
  const fontClass =
    fontStyle === 'serif'
      ? 'font-serif'
      : fontStyle === 'mono'
      ? 'font-mono'
      : fontStyle === 'sans'
      ? 'font-medium'
      : 'font-black';

  return (
    <div className="fixed inset-0 z-[1150] bg-black/95 text-white flex flex-col overflow-hidden select-none">
      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept="image/*,video/*"
        onChange={handleFilePicked}
      />

      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/60 backdrop-blur-md z-30">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X size={20} />
          </button>
          <div>
            <h2 className="font-black text-sm sm:text-base">Create Status</h2>
            <p className="text-[11px] text-white/60">Custom Privacy · 24h–7d Auto-Delete</p>
          </div>
        </div>

        {/* Mode Switch Pills */}
        <div className="flex items-center gap-1.5 bg-white/10 p-1 rounded-full">
          <button
            type="button"
            onClick={() => setMode('picker')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              mode === 'picker' || mode === 'editor' ? 'bg-[#1877F2] text-white' : 'text-white/75 hover:text-white'
            }`}
          >
            Media
          </button>
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              mode === 'text' ? 'bg-[#1877F2] text-white' : 'text-white/75 hover:text-white'
            }`}
          >
            Text
          </button>
        </div>
      </div>

      {/* Center Stage */}
      {mode === 'picker' ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5 max-w-md mx-auto w-full">
          <div className="text-center space-y-1.5 mb-2">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#1877F2] to-sky-400 mx-auto flex items-center justify-center shadow-xl shadow-blue-500/30 mb-3">
              <Camera size={30} className="text-white" />
            </div>
            <h3 className="text-xl font-black">Share a Status Update</h3>
            <p className="text-xs text-white/65">
              Edit photos &amp; videos with emojis, captions &amp; drawings. Set auto-delete from 24 hours up to 7 days.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 w-full">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning}
              className="flex items-center gap-4 p-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 transition-all text-left"
            >
              <div className="p-3 rounded-xl bg-[#1877F2] text-white">
                <ImageIcon size={22} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm">{isScanning ? 'Scanning media safety...' : 'Photo or Video from Gallery'}</p>
                <p className="text-xs text-white/60">Edit, trim video, add emojis &amp; caption</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setShowCamera(true)}
              className="flex items-center gap-4 p-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 transition-all text-left"
            >
              <div className="p-3 rounded-xl bg-sky-500 text-white">
                <Camera size={22} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm">Take Photo or Record Video</p>
                <p className="text-xs text-white/60">Capture live with filters &amp; instant edit</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode('text')}
              className="flex items-center gap-4 p-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 transition-all text-left"
            >
              <div className="p-3 rounded-xl bg-indigo-500 text-white">
                <Type size={22} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm">Text Status</p>
                <p className="text-xs text-white/60">Colorful gradients, fonts &amp; emoji stickers</p>
              </div>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 relative">
          {/* Interactive Edit Tools Bar */}
          <div className="flex items-center justify-center gap-2 px-3 py-2 bg-black/40 border-b border-white/10 overflow-x-auto scrollbar-hide z-30">
            {mode === 'editor' && mediaType === 'image' && (
              <button
                type="button"
                onClick={() => setIsCropping(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-bold shrink-0"
              >
                <CropIcon size={14} /> Crop
              </button>
            )}
            {mode === 'editor' && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTool(activeTool === 'filter' ? 'none' : 'filter')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 ${
                    activeTool === 'filter' || filterPreset !== 'none' ? 'bg-[#1877F2] text-white' : 'bg-white/10 hover:bg-white/20'
                  }`}
                >
                  <SlidersHorizontal size={14} /> Filter
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTool(activeTool === 'draw' ? 'none' : 'draw')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 ${
                    activeTool === 'draw' ? 'bg-[#1877F2] text-white' : 'bg-white/10 hover:bg-white/20'
                  }`}
                >
                  <PenTool size={14} /> Draw
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTool(activeTool === 'text' ? 'none' : 'text')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 ${
                    activeTool === 'text' ? 'bg-[#1877F2] text-white' : 'bg-white/10 hover:bg-white/20'
                  }`}
                >
                  <Type size={14} /> Add Text
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setEmojiTarget('sticker');
                setActiveTool(activeTool === 'emoji' && emojiTarget === 'sticker' ? 'none' : 'emoji');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 ${
                activeTool === 'emoji' && emojiTarget === 'sticker' ? 'bg-[#1877F2] text-white' : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              <Smile size={14} /> Emoji / Sticker
            </button>

            {mode === 'editor' && mediaType === 'video' && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTool(activeTool === 'trim' ? 'none' : 'trim')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 ${
                    activeTool === 'trim' ? 'bg-[#1877F2] text-white' : 'bg-white/10 hover:bg-white/20'
                  }`}
                >
                  <Scissors size={14} /> Trim
                </button>
                <button
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 ${
                    isMuted ? 'bg-red-500/80 text-white' : 'bg-white/10 hover:bg-white/20'
                  }`}
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  {isMuted ? 'Muted' : 'Sound'}
                </button>
              </>
            )}

            {mode === 'text' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const idx = STATUS_BG_PRESETS.findIndex((b) => b.id === bgPresetId);
                    setBgPresetId(STATUS_BG_PRESETS[(idx + 1) % STATUS_BG_PRESETS.length].id);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-xs font-bold shrink-0"
                >
                  <Palette size={14} /> Color
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const order: ('bold' | 'sans' | 'serif' | 'mono')[] = ['bold', 'sans', 'serif', 'mono'];
                    setFontStyle(order[(order.indexOf(fontStyle) + 1) % order.length]);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-xs font-bold shrink-0"
                >
                  <Type size={14} /> Font: {fontStyle.toUpperCase()}
                </button>
              </>
            )}

            {mode === 'editor' && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-bold shrink-0"
              >
                <RotateCcw size={13} /> Change
              </button>
            )}
          </div>

          {/* Main Canvas Stage */}
          <div className="flex-1 flex items-center justify-center p-2 sm:p-4 min-h-0 relative overflow-hidden">
            <div
              ref={stageRef}
              onClick={() => { setSelectedStickerId(null); setSelectedTextId(null); }}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
              style={mode === 'text' ? { background: activeBg.gradient } : undefined}
              className="relative w-full max-w-[380px] h-full max-h-[540px] rounded-3xl overflow-hidden bg-zinc-950 border border-white/15 shadow-2xl flex items-center justify-center"
            >
              {mode === 'text' ? (
                <div className="w-full h-full flex flex-col items-center justify-center p-6">
                  <textarea
                    value={textStatusValue}
                    onChange={(e) => setTextStatusValue(e.target.value)}
                    maxLength={500}
                    placeholder="Type a status..."
                    className={`w-full bg-transparent border-none outline-none text-center text-white placeholder-white/55 text-2xl sm:text-3xl leading-snug resize-none ${fontClass}`}
                    rows={5}
                  />
                </div>
              ) : mediaType === 'image' ? (
                <img
                  src={mediaSource}
                  alt="Status preview"
                  style={{ filter: STORY_FILTER_CSS[filterPreset] }}
                  className="w-full h-full object-contain pointer-events-none select-none"
                />
              ) : (
                <video
                  ref={videoRef}
                  src={mediaSource}
                  autoPlay
                  loop
                  playsInline
                  muted={isMuted}
                  onLoadedMetadata={(e) => {
                    const dur = e.currentTarget.duration || 0;
                    setVideoDuration(dur);
                    if (dur > 0 && trimEnd === 0) {
                      setTrimEnd(Math.min(dur, 60));
                    }
                  }}
                  style={{ filter: STORY_FILTER_CSS[filterPreset] }}
                  className="w-full h-full object-contain pointer-events-none select-none"
                />
              )}

              {/* Drawing SVG Layer (Photo & Video) */}
              <svg
                className={`absolute inset-0 w-full h-full z-10 ${
                  activeTool === 'draw' ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'
                }`}
              >
                {paths.map((p, i) => (
                  <polyline
                    key={i}
                    points={p.points
                      .map((pt) => `${(pt.x / 100) * containerSize.width},${(pt.y / 100) * containerSize.height}`)
                      .join(' ')}
                    fill="none"
                    stroke={p.color}
                    strokeWidth={p.width || 4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {currentPath.length > 0 && (
                  <polyline
                    points={currentPath
                      .map((pt) => `${(pt.x / 100) * containerSize.width},${(pt.y / 100) * containerSize.height}`)
                      .join(' ')}
                    fill="none"
                    stroke={brushColor}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </svg>

              {/* Draggable Text Overlays (Photo & Video) */}
              {texts.map((item) => (
                <DraggableTextOverlay
                  key={item.id}
                  item={item}
                  containerSize={containerSize}
                  selected={selectedTextId === item.id}
                  onSelect={() => { setSelectedTextId(item.id); setSelectedStickerId(null); }}
                  onMove={(id, x, y) => setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, x, y } : t)))}
                />
              ))}

              {/* Draggable Stickers / Emojis (Photo, Video & Text) */}
              {stickers.map((stk) => (
                <DraggableSticker
                  key={stk.id}
                  sticker={stk}
                  containerSize={containerSize}
                  selected={selectedStickerId === stk.id}
                  onSelect={() => { setSelectedStickerId(stk.id); setSelectedTextId(null); }}
                  onMove={(id, x, y) => setStickers((prev) => prev.map((s) => (s.id === id ? { ...s, x, y } : s)))}
                />
              ))}

              {/* Selected Sticker / Text Quick Controls */}
              {(selectedStickerId || selectedTextId) && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-3 left-3 right-3 z-30 bg-black/80 backdrop-blur-md rounded-2xl p-2.5 flex items-center gap-3 border border-white/15"
                >
                  {selectedStickerId && (
                    <>
                      <span className="text-[11px] font-bold text-white/80">Size</span>
                      <input
                        type="range"
                        min={24}
                        max={110}
                        value={stickers.find((s) => s.id === selectedStickerId)?.size || 46}
                        onChange={(e) => {
                          const sz = Number(e.target.value);
                          setStickers((prev) => prev.map((s) => (s.id === selectedStickerId ? { ...s, size: sz } : s)));
                        }}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setStickers((prev) => prev.filter((s) => s.id !== selectedStickerId));
                          setSelectedStickerId(null);
                        }}
                        className="p-1.5 rounded-full bg-red-500/80 text-white"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                  {selectedTextId && (
                    <>
                      <span className="text-[11px] font-bold text-white/80">Text Size</span>
                      <input
                        type="range"
                        min={16}
                        max={52}
                        value={texts.find((t) => t.id === selectedTextId)?.size || 26}
                        onChange={(e) => {
                          const sz = Number(e.target.value);
                          setTexts((prev) => prev.map((t) => (t.id === selectedTextId ? { ...t, size: sz } : t)));
                        }}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setTexts((prev) => prev.filter((t) => t.id !== selectedTextId));
                          setSelectedTextId(null);
                        }}
                        className="p-1.5 rounded-full bg-red-500/80 text-white"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Tool Drawers Overlay */}
            {activeTool === 'filter' && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40 bg-black/85 backdrop-blur-md border border-white/15 rounded-2xl p-2.5 flex items-center gap-2 max-w-[95%] overflow-x-auto">
                {(['none', 'vivid', 'warm', 'cool', 'bw', 'vintage'] as StoryFilterPreset[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilterPreset(f)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize whitespace-nowrap ${
                      filterPreset === f ? 'bg-[#1877F2] text-white' : 'bg-white/10 text-white/80'
                    }`}
                  >
                    {f === 'none' ? 'Original' : f.toUpperCase()}
                  </button>
                ))}
              </div>
            )}

            {activeTool === 'draw' && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40 bg-black/85 backdrop-blur-md border border-white/15 rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5">
                {['#1877F2', '#ffffff', '#ef4444', '#38bdf8', '#facc15', '#ec4899', '#000000'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBrushColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-6 h-6 rounded-full border-2 ${brushColor === c ? 'border-white scale-125' : 'border-white/40'}`}
                  />
                ))}
                {paths.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPaths([])}
                    className="ml-1 px-2.5 py-1 rounded-full bg-red-500/80 text-[11px] font-bold"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            {activeTool === 'text' && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-sm bg-gray-900/95 backdrop-blur-md border border-white/15 rounded-2xl p-3 space-y-2.5">
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={newOverlayText}
                    onChange={(e) => setNewOverlayText(e.target.value)}
                    placeholder="Write text overlay for photo/video..."
                    className="flex-1 bg-white/10 rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddTextOverlay(); }}
                  />
                  <button
                    type="button"
                    onClick={handleAddTextOverlay}
                    className="px-3.5 py-2 rounded-xl bg-[#1877F2] font-bold text-xs flex items-center gap-1"
                  >
                    <Check size={14} /> Add
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {['#ffffff', '#1877F2', '#facc15', '#f43f5e', '#38bdf8', '#000000'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewOverlayColor(c)}
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded-full border ${newOverlayColor === c ? 'border-white scale-125' : 'border-white/30'}`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewOverlayBg(newOverlayBg === 'transparent' ? 'rgba(0,0,0,0.55)' : 'transparent')}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/10"
                  >
                    {newOverlayBg === 'transparent' ? 'Pill: Off' : 'Pill: On'}
                  </button>
                </div>
              </div>
            )}

            {activeTool === 'trim' && mediaType === 'video' && videoDuration > 0 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-sm bg-gray-900/95 backdrop-blur-md border border-white/15 rounded-2xl p-3 space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-blue-400">Trim Video</span>
                  <span>
                    {Math.floor(trimStart)}s → {Math.floor(trimEnd || videoDuration)}s (Total {Math.max(1, Math.floor((trimEnd || videoDuration) - trimStart))}s)
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-white/70 w-10">Start</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, (trimEnd || videoDuration) - 1)}
                    step={0.5}
                    value={trimStart}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setTrimStart(v);
                      if (videoRef.current) videoRef.current.currentTime = v;
                    }}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-white/70 w-10">End</span>
                  <input
                    type="range"
                    min={Math.min(videoDuration, trimStart + 1)}
                    max={videoDuration}
                    step={0.5}
                    value={trimEnd || videoDuration}
                    onChange={(e) => setTrimEnd(Number(e.target.value))}
                    className="flex-1"
                  />
                </div>
              </div>
            )}

            {activeTool === 'emoji' && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 z-50 bg-gray-950 border border-white/15 rounded-2xl p-2 shadow-2xl max-w-[95vw]"
              >
                <div className="flex items-center justify-between px-2 pb-1.5">
                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
                    {QUICK_EMOJIS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => addStickerEmoji(em)}
                        className="text-xl hover:scale-125 transition-transform px-1"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTool('none')}
                    className="p-1 text-white/60 hover:text-white ml-2"
                  >
                    <X size={16} />
                  </button>
                </div>
                <EmojiPicker
                  theme={Theme.DARK}
                  height={280}
                  width={310}
                  onEmojiClick={(emojiData) => addStickerEmoji(emojiData.emoji)}
                />
              </div>
            )}
          </div>

          {/* Bottom Controls: Auto-Delete Timer (24h – 7d), Privacy, Caption + Send */}
          <div className="bg-black/85 backdrop-blur-xl border-t border-white/10 p-3 sm:p-4 space-y-2.5 z-30">
            {/* Auto-Delete Duration (Up to 7 Days Max) + Privacy Row */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide max-w-full">
                <span className="flex items-center gap-1 text-[11px] font-bold text-blue-400 shrink-0 mr-1">
                  <Clock size={13} /> Auto-Delete:
                </span>
                {STATUS_DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.hours}
                    type="button"
                    onClick={() => setDurationHours(opt.hours)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap border transition-all ${
                      durationHours === opt.hours
                        ? 'bg-[#1877F2] text-white border-blue-400 shadow-sm'
                        : 'bg-white/10 text-white/80 border-white/10 hover:bg-white/15'
                    }`}
                  >
                    {opt.label}
                    {opt.badge ? ` (${opt.badge})` : ''}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowPrivacyModal(true)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-bold text-white shrink-0"
              >
                <Lock size={12} className="text-blue-400" />
                <span>{getPrivacySummaryLabel(visibility, allowedUserIds.length, excludedUserIds.length)}</span>
              </button>
            </div>

            {/* Caption + Emoji + Send */}
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center bg-white/10 border border-white/15 rounded-full px-3.5 py-2 focus-within:border-[#1877F2] transition-colors">
                <button
                  type="button"
                  onClick={() => {
                    setEmojiTarget('caption');
                    setActiveTool(activeTool === 'emoji' && emojiTarget === 'caption' ? 'none' : 'emoji');
                  }}
                  className="text-white/75 hover:text-blue-400 mr-2 shrink-0"
                  title="Add emoji to caption"
                >
                  <Smile size={19} />
                </button>
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={500}
                  placeholder={mediaType === 'video' ? 'Add a caption & emojis to video...' : 'Add a caption & emojis...'}
                  className="bg-transparent border-none outline-none text-xs sm:text-sm w-full text-white placeholder-white/55 font-medium"
                />
              </div>

              <button
                type="button"
                onClick={handlePublishStatus}
                disabled={isPublishing || (mode === 'text' && !textStatusValue.trim())}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#1877F2] hover:bg-blue-600 disabled:opacity-50 text-white font-black text-xs sm:text-sm shadow-lg shadow-blue-500/30 transition-all active:scale-95 shrink-0"
              >
                {isPublishing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                <span>Share</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Modal */}
      {currentUser?.id && (
        <StatusPrivacyModal
          isOpen={showPrivacyModal}
          currentUserId={currentUser.id}
          initialVisibility={visibility}
          initialAllowedIds={allowedUserIds}
          initialExcludedIds={excludedUserIds}
          onClose={() => setShowPrivacyModal(false)}
          onSave={(cfg) => {
            setVisibility(cfg.visibility);
            setAllowedUserIds(cfg.allowed_user_ids);
            setExcludedUserIds(cfg.excluded_user_ids);
          }}
        />
      )}
    </div>
  );
};
