import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Trash2,
  Lock,
  Clock,
  Volume2,
  VolumeX,
  Send,
  Plus,
  Pause,
  Play,
  Globe,
  Users,
  UserX,
  UserCheck,
  Smile,
  Check,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useAuth } from '@/contexts/AuthContext';
import { writeSupabaseMessage } from '@/lib/dbHelper';
import { triggerNotification } from '@/services/notificationService';
import { Story, StoryVisibility } from '@/types';
import {
  STATUS_DURATION_OPTIONS,
  STORY_FILTER_CSS,
  StatusGroup,
  deleteStoryById,
  formatRelativeStatusTime,
  formatRemainingStatusTime,
  getBgPresetStyle,
  getPrivacySummaryLabel,
  recordStoryView,
  updateStorySettings,
} from '@/services/statusService';
import { StatusPrivacyModal } from './StatusPrivacyModal';

interface StatusViewerModalProps {
  isOpen: boolean;
  groups: StatusGroup[];
  initialGroupIndex: number;
  viewedStoryIds: Set<string>;
  onClose: () => void;
  onStoryViewed: (storyId: string) => void;
  onAddStatus: () => void;
  onRefresh: () => void;
}

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '🔥', '👏'];
const PHOTO_DURATION_MS = 6500;

export const StatusViewerModal: React.FC<StatusViewerModalProps> = ({
  isOpen,
  groups,
  initialGroupIndex,
  viewedStoryIds,
  onClose,
  onStoryViewed,
  onAddStatus,
  onRefresh,
}) => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isHoldingPause, setIsHoldingPause] = useState(false);
  const [isManualPaused, setIsManualPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [floatingReaction, setFloatingReaction] = useState<string | null>(null);

  const [showViewersSheet, setShowViewersSheet] = useState(false);
  const [showPrivacyEditor, setShowPrivacyEditor] = useState(false);
  const [showDurationEditor, setShowDurationEditor] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recordedViewsRef = useRef<Set<string>>(new Set());
  const replyInputRef = useRef<HTMLInputElement | null>(null);
  const [isReplyFocused, setIsReplyFocused] = useState(false);

  // Sync group & first unviewed story when opened
  useEffect(() => {
    if (!isOpen || groups.length === 0) return;
    const clampedIdx = Math.max(0, Math.min(initialGroupIndex, groups.length - 1));
    setGroupIndex(clampedIdx);
    const targetGroup = groups[clampedIdx];
    const firstUnviewed =
      targetGroup && !targetGroup.isOwn
        ? targetGroup.stories.findIndex((s) => !viewedStoryIds.has(s.id))
        : 0;
    setStoryIndex(firstUnviewed >= 0 ? firstUnviewed : 0);
    setProgress(0);
    setShowViewersSheet(false);
    setShowPrivacyEditor(false);
    setShowDurationEditor(false);
    setShowDeleteConfirm(false);
    setReplyText('');
    setIsManualPaused(false);
    setIsHoldingPause(false);
  }, [isOpen, initialGroupIndex, groups.length]);

  const currentGroup = groups[groupIndex];
  const currentStory: Story | undefined = currentGroup?.stories?.[storyIndex];
  const isOwn = Boolean(currentUser?.id && currentStory?.user_id === currentUser.id);

  // Sync mute state from story edit metadata on story switch
  useEffect(() => {
    if (!currentStory) return;
    setIsMuted(Boolean(currentStory.edit_metadata?.muted));
    setProgress(0);
  }, [currentStory?.id]);

  // Mark story viewed automatically for non-owners
  useEffect(() => {
    if (!isOpen || !currentStory || !currentUser?.id) return;
    if (currentStory.user_id === currentUser.id) return;
    if (recordedViewsRef.current.has(currentStory.id)) return;
    recordedViewsRef.current.add(currentStory.id);
    onStoryViewed(currentStory.id);
    recordStoryView(currentStory, currentUser).catch(() => {});
  }, [isOpen, currentStory?.id, currentUser?.id, onStoryViewed]);

  const goNext = useCallback(() => {
    if (!currentGroup) {
      onClose();
      return;
    }
    if (storyIndex + 1 < currentGroup.stories.length) {
      setStoryIndex((s) => s + 1);
      setProgress(0);
      return;
    }
    if (groupIndex + 1 < groups.length) {
      const nextGrp = groups[groupIndex + 1];
      const nextFirstUnviewed = !nextGrp.isOwn
        ? nextGrp.stories.findIndex((s) => !viewedStoryIds.has(s.id))
        : 0;
      setGroupIndex((g) => g + 1);
      setStoryIndex(nextFirstUnviewed >= 0 ? nextFirstUnviewed : 0);
      setProgress(0);
      return;
    }
    onClose();
  }, [currentGroup, storyIndex, groupIndex, groups, viewedStoryIds, onClose]);

  const goPrev = useCallback(() => {
    if (storyIndex > 0) {
      setStoryIndex((s) => s - 1);
      setProgress(0);
      return;
    }
    if (groupIndex > 0) {
      const prevGrp = groups[groupIndex - 1];
      setGroupIndex((g) => g - 1);
      setStoryIndex(Math.max(0, (prevGrp?.stories?.length || 1) - 1));
      setProgress(0);
    }
  }, [storyIndex, groupIndex, groups]);

  const isOverlayOpen =
    showViewersSheet || showPrivacyEditor || showDurationEditor || showDeleteConfirm || isReplyFocused;
  const isPaused = isHoldingPause || isManualPaused || isOverlayOpen;

  // Image / Text timer
  useEffect(() => {
    if (!isOpen || !currentStory || currentStory.media_type === 'video' || isPaused) return;

    const tickMs = 50;
    const step = (tickMs / PHOTO_DURATION_MS) * 100;
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        if (prev + step >= 100) {
          window.clearInterval(timer);
          goNext();
          return 100;
        }
        return prev + step;
      });
    }, tickMs);

    return () => window.clearInterval(timer);
  }, [isOpen, currentStory?.id, currentStory?.media_type, isPaused, goNext]);

  // Video playback & trim enforcement
  useEffect(() => {
    const vid = videoRef.current;
    if (!isOpen || !currentStory || currentStory.media_type !== 'video' || !vid) return;

    if (isPaused) {
      vid.pause();
    } else {
      vid.play().catch(() => {});
    }
  }, [isOpen, currentStory?.id, currentStory?.media_type, isPaused]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !currentStory || currentStory.media_type !== 'video') return;

    const trimStart = Math.max(0, Number(currentStory.edit_metadata?.trimStart) || 0);
    const rawTrimEnd = Number(currentStory.edit_metadata?.trimEnd) || 0;

    const handleLoaded = () => {
      if (trimStart > 0 && vid.duration > trimStart) {
        vid.currentTime = trimStart;
      }
      if (!isPaused) vid.play().catch(() => {});
    };

    const handleTimeUpdate = () => {
      const dur = vid.duration || 1;
      const effectiveEnd = rawTrimEnd > trimStart && rawTrimEnd <= dur ? rawTrimEnd : dur;
      const span = Math.max(0.5, effectiveEnd - trimStart);
      const elapsed = Math.max(0, vid.currentTime - trimStart);
      const pct = Math.min(100, (elapsed / span) * 100);
      setProgress(pct);

      if (vid.currentTime >= effectiveEnd - 0.08) {
        goNext();
      }
    };

    vid.addEventListener('loadedmetadata', handleLoaded);
    vid.addEventListener('timeupdate', handleTimeUpdate);
    vid.addEventListener('ended', goNext);

    return () => {
      vid.removeEventListener('loadedmetadata', handleLoaded);
      vid.removeEventListener('timeupdate', handleTimeUpdate);
      vid.removeEventListener('ended', goNext);
    };
  }, [currentStory?.id, isPaused, goNext]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isOverlayOpen) {
          setShowViewersSheet(false);
          setShowPrivacyEditor(false);
          setShowDurationEditor(false);
          setShowDeleteConfirm(false);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowRight' && !isReplyFocused) {
        goNext();
      } else if (e.key === 'ArrowLeft' && !isReplyFocused) {
        goPrev();
      } else if (e.key === ' ' && !isReplyFocused) {
        e.preventDefault();
        setIsManualPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isOverlayOpen, isReplyFocused, goNext, goPrev, onClose]);

  const privacyBadgeIcon = useMemo(() => {
    if (!currentStory) return <Users size={11} />;
    switch (currentStory.visibility) {
      case 'public':
        return <Globe size={11} />;
      case 'friends_except':
        return <UserX size={11} />;
      case 'only_share':
        return <UserCheck size={11} />;
      default:
        return <Users size={11} />;
    }
  }, [currentStory?.visibility]);

  if (!isOpen || !currentGroup || !currentStory) return null;

  const filterCss =
    currentStory.edit_metadata?.filter && STORY_FILTER_CSS[currentStory.edit_metadata.filter]
      ? STORY_FILTER_CSS[currentStory.edit_metadata.filter]
      : undefined;

  const fontClass =
    currentStory.font_style === 'serif'
      ? 'font-serif'
      : currentStory.font_style === 'mono'
      ? 'font-mono'
      : currentStory.font_style === 'sans'
      ? 'font-sans font-semibold'
      : 'font-black';

  const handleReact = async (emoji: string) => {
    if (!currentUser?.id) {
      toast.info('Log in to react to statuses.');
      return;
    }
    setFloatingReaction(emoji);
    window.setTimeout(() => setFloatingReaction(null), 900);
    await recordStoryView(currentStory, currentUser, emoji);
    toast.success(`Sent ${emoji} reaction`);
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = replyText.trim();
    if (!clean) return;
    if (!currentUser?.id) {
      toast.info('Please log in to reply to statuses.');
      navigate('/login');
      onClose();
      return;
    }

    setIsSendingReply(true);
    try {
      const statusSnippet =
        currentStory.media_type === 'text'
          ? (currentStory.text_content || '').slice(0, 60)
          : currentStory.caption
          ? currentStory.caption.slice(0, 60)
          : currentStory.media_type === 'video'
          ? 'Video Status'
          : 'Photo Status';

      const fullReply = `[Status Reply: "${statusSnippet}"]\n${clean}`;
      const chatId = [currentUser.id, currentStory.user_id].sort().join('_');

      await writeSupabaseMessage({
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `strep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        sender_id: currentUser.id,
        receiver_id: currentStory.user_id,
        chat_id: chatId,
        content: fullReply,
        text: fullReply,
        is_read: false,
        created_at: new Date().toISOString(),
      });

      triggerNotification(
        currentStory.user_id,
        `${currentUser.display_name || currentUser.username || 'Friend'} replied to your status`,
        clean,
        {
          url: `/messages?user=${currentUser.id}`,
          sender_id: currentUser.id,
          type: 'chat',
        }
      ).catch(() => {});

      setReplyText('');
      replyInputRef.current?.blur();
      toast.success(`Reply sent to ${currentGroup.user.display_name}!`);
    } catch {
      toast.error('Failed to send reply.');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleDeleteCurrentStory = async () => {
    if (!isOwn) return;
    setIsMutating(true);
    try {
      await deleteStoryById(currentStory.id, currentStory.user_id);
      toast.success('Status deleted');
      setShowDeleteConfirm(false);
      onRefresh();
      if (currentGroup.stories.length <= 1) {
        onClose();
      } else {
        setStoryIndex((idx) => Math.max(0, idx - 1));
      }
    } catch {
      toast.error('Failed to delete status.');
    } finally {
      setIsMutating(false);
    }
  };

  const handleSavePrivacyUpdate = async (cfg: {
    visibility: StoryVisibility;
    allowed_user_ids: string[];
    excluded_user_ids: string[];
  }) => {
    if (!isOwn) return;
    setIsMutating(true);
    try {
      await updateStorySettings(currentStory.id, currentStory.user_id, {
        visibility: cfg.visibility,
        allowed_user_ids: cfg.allowed_user_ids,
        excluded_user_ids: cfg.excluded_user_ids,
      });
      toast.success('Status privacy updated!');
      setShowPrivacyEditor(false);
      onRefresh();
    } catch {
      toast.error('Could not update status privacy.');
    } finally {
      setIsMutating(false);
    }
  };

  const handleChangeDuration = async (hours: number) => {
    if (!isOwn) return;
    setIsMutating(true);
    try {
      await updateStorySettings(currentStory.id, currentStory.user_id, {
        visibility: currentStory.visibility,
        allowed_user_ids: currentStory.allowed_user_ids,
        excluded_user_ids: currentStory.excluded_user_ids,
        duration_hours: hours,
        created_at_ms: currentStory.created_at_ms,
      });
      toast.success(
        `Auto-delete set to ${hours === 24 ? '24 Hours' : `${hours / 24} Days`}`
      );
      setShowDurationEditor(false);
      onRefresh();
    } catch {
      toast.error('Failed to update auto-delete timer.');
    } finally {
      setIsMutating(false);
    }
  };

  const viewers = currentStory.story_views || [];

  return (
    <div className="fixed inset-0 z-[1200] bg-black/95 backdrop-blur-md flex items-center justify-center select-none">
      {/* Desktop Prev Group / Story */}
      <button
        type="button"
        onClick={goPrev}
        disabled={groupIndex === 0 && storyIndex === 0}
        className="hidden md:flex items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-20 text-white mr-4 transition-all"
        aria-label="Previous status"
      >
        <ChevronLeft size={24} />
      </button>

      {/* Main Story Phone Frame */}
      <div className="relative w-full h-full sm:h-[90vh] sm:max-w-[440px] sm:rounded-3xl overflow-hidden bg-zinc-950 shadow-2xl border border-white/10 flex flex-col">
        {/* Progress Bars */}
        <div className="absolute top-0 inset-x-0 z-30 pt-3 px-3 flex gap-1.5">
          {currentGroup.stories.map((st, idx) => {
            const pct = idx < storyIndex ? 100 : idx === storyIndex ? progress : 0;
            return (
              <div key={st.id} className="h-1 flex-1 rounded-full bg-white/25 overflow-hidden">
                <div
                  className="h-full bg-[#1877F2] transition-[width] duration-75 ease-linear"
                  style={{ width: `${pct}%` }}
                />
              </div>
            );
          })}
        </div>

        {/* Top Author Header */}
        <div className="absolute top-6 inset-x-0 z-30 px-3.5 pt-2 pb-4 bg-gradient-to-b from-black/75 via-black/35 to-transparent flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <ProfileAvatar
              userId={currentGroup.user.id}
              defaultAvatar={currentGroup.user.avatar_url}
              name={currentGroup.user.display_name}
              className="w-10 h-10 rounded-full object-cover border-2 border-[#1877F2] shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <p className="text-white font-bold text-sm truncate">
                  {isOwn ? 'My Status' : currentGroup.user.display_name}
                </p>
                {currentGroup.user.is_verified && <VerifiedBadge size={13} />}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/80 font-medium">
                <span>{formatRelativeStatusTime(currentStory.created_at_ms)}</span>
                <span>•</span>
                <span className="inline-flex items-center gap-1 text-blue-300 font-bold">
                  <Clock size={10} />
                  {formatRemainingStatusTime(currentStory.expires_at_ms)}
                </span>
                {isOwn && (
                  <>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => setShowPrivacyEditor(true)}
                      className="inline-flex items-center gap-1 bg-white/15 hover:bg-white/25 px-2 py-0.5 rounded-full text-[10px] font-bold text-white transition-colors"
                    >
                      {privacyBadgeIcon}
                      {getPrivacySummaryLabel(
                        currentStory.visibility,
                        currentStory.allowed_user_ids?.length || 0,
                        currentStory.excluded_user_ids?.length || 0
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {currentStory.media_type === 'video' && (
              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
                className="p-2 rounded-full bg-black/40 hover:bg-black/65 text-white transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsManualPaused((p) => !p)}
              className="p-2 rounded-full bg-black/40 hover:bg-black/65 text-white transition-colors"
              title={isManualPaused ? 'Resume' : 'Pause'}
            >
              {isManualPaused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            {isOwn && (
              <>
                <button
                  type="button"
                  onClick={() => setShowDurationEditor(true)}
                  className="p-2 rounded-full bg-black/40 hover:bg-black/65 text-blue-300 transition-colors"
                  title="Auto-Delete Timer (Up to 7 Days)"
                >
                  <Clock size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2 rounded-full bg-black/40 hover:bg-red-600/80 text-white transition-colors"
                  title="Delete Status"
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full bg-black/40 hover:bg-black/65 text-white transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Media / Text Stage */}
        <div
          className="relative flex-1 flex items-center justify-center overflow-hidden"
          onPointerDown={() => setIsHoldingPause(true)}
          onPointerUp={() => setIsHoldingPause(false)}
          onPointerCancel={() => setIsHoldingPause(false)}
          onPointerLeave={() => setIsHoldingPause(false)}
        >
          {/* Left / Right tap zones */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            className="absolute inset-y-20 left-0 w-[26%] z-20 cursor-pointer"
          />
          <div
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            className="absolute inset-y-20 right-0 w-[26%] z-20 cursor-pointer"
          />

          {currentStory.media_type === 'text' ? (
            <div
              className="w-full h-full flex items-center justify-center p-8 text-center relative"
              style={{ background: getBgPresetStyle(currentStory.bg_style) }}
            >
              <p
                className={`text-white text-2xl sm:text-3xl leading-snug break-words drop-shadow-md ${fontClass}`}
              >
                {currentStory.text_content || currentStory.caption}
              </p>
              {/* Sticker overlays for text status */}
              {currentStory.edit_metadata?.stickers?.map((stk) => (
                <div
                  key={stk.id}
                  style={{ left: `${stk.x}%`, top: `${stk.y}%`, fontSize: `${stk.size}px` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none drop-shadow-md"
                >
                  {stk.emoji}
                </div>
              ))}
            </div>
          ) : currentStory.media_type === 'video' ? (
            <div className="relative w-full h-full bg-black flex items-center justify-center">
              <video
                ref={videoRef}
                key={currentStory.id}
                src={currentStory.media_url}
                muted={isMuted}
                playsInline
                autoPlay
                style={{ filter: filterCss }}
                className="w-full h-full object-contain"
              />
              {/* Freehand drawing overlay for video */}
              {currentStory.edit_metadata?.paths &&
                currentStory.edit_metadata.paths.length > 0 && (
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="absolute inset-0 w-full h-full pointer-events-none z-10"
                  >
                    {currentStory.edit_metadata.paths.map((p, idx) => (
                      <polyline
                        key={idx}
                        fill="none"
                        stroke={p.color}
                        strokeWidth={p.width || 4}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                        points={p.points.map((pt) => `${pt.x},${pt.y}`).join(' ')}
                      />
                    ))}
                  </svg>
                )}
              {/* Text overlays for video */}
              {currentStory.edit_metadata?.texts?.map((txt) => (
                <div
                  key={txt.id}
                  style={{
                    left: `${txt.x}%`,
                    top: `${txt.y}%`,
                    color: txt.color,
                    backgroundColor: txt.bg || 'transparent',
                    fontSize: `${txt.size}px`,
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 px-3 py-1 rounded-xl font-extrabold pointer-events-none z-10 text-center max-w-[85%] break-words shadow-md"
                >
                  {txt.text}
                </div>
              ))}
              {/* Emoji / Sticker overlays for video */}
              {currentStory.edit_metadata?.stickers?.map((stk) => (
                <div
                  key={stk.id}
                  style={{ left: `${stk.x}%`, top: `${stk.y}%`, fontSize: `${stk.size}px` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10 select-none drop-shadow-md"
                >
                  {stk.emoji}
                </div>
              ))}
            </div>
          ) : (
            <img
              src={currentStory.media_url}
              alt={currentStory.caption || 'Status'}
              style={{ filter: filterCss }}
              className="w-full h-full object-contain bg-black"
              referrerPolicy="no-referrer"
            />
          )}

          {/* Floating reaction burst */}
          {floatingReaction && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-bounce text-7xl drop-shadow-2xl">
              {floatingReaction}
            </div>
          )}
        </div>

        {/* Caption + Footer Action Bar */}
        <div className="relative z-30 bg-gradient-to-t from-black via-black/85 to-transparent px-4 pt-4 pb-5 space-y-3">
          {currentStory.caption && currentStory.media_type !== 'text' && (
            <p className="text-white text-sm font-medium text-center leading-relaxed bg-black/45 backdrop-blur-sm rounded-2xl px-4 py-2 border border-white/10 max-h-24 overflow-y-auto">
              {currentStory.caption}
            </p>
          )}

          {isOwn ? (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowViewersSheet(true)}
                className="flex items-center gap-2.5 bg-white/15 hover:bg-white/25 text-white px-4 py-2.5 rounded-full text-xs font-extrabold transition-all"
              >
                <Eye size={16} className="text-blue-400" />
                <span>Seen by {viewers.length}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPrivacyEditor(true)}
                  className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white px-3.5 py-2.5 rounded-full text-xs font-bold transition-all"
                >
                  <Lock size={14} />
                  Privacy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onAddStatus();
                  }}
                  className="flex items-center gap-1.5 bg-[#1877F2] hover:bg-blue-600 text-white px-4 py-2.5 rounded-full text-xs font-black transition-all shadow-md"
                >
                  <Plus size={15} />
                  Add
                </button>
              </div>
            </div>
          ) : currentUser ? (
            <div className="space-y-2.5">
              {/* Quick Emoji Reactions */}
              <div className="flex items-center justify-center gap-2">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleReact(emoji)}
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/25 active:scale-125 text-lg flex items-center justify-center transition-all"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              {/* Reply Input */}
              <form onSubmit={handleSendReply} className="flex items-center gap-2">
                <div className="flex-1 flex items-center bg-white/15 border border-white/20 rounded-full px-3.5 py-2 focus-within:border-[#1877F2]">
                  <Smile size={16} className="text-white/60 mr-2 shrink-0" />
                  <input
                    ref={replyInputRef}
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onFocus={() => setIsReplyFocused(true)}
                    onBlur={() => setIsReplyFocused(false)}
                    placeholder={`Reply to ${currentGroup.user.display_name}...`}
                    className="w-full bg-transparent text-white placeholder-white/60 text-sm outline-none font-medium"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!replyText.trim() || isSendingReply}
                  className="w-10 h-10 rounded-full bg-[#1877F2] disabled:bg-white/20 text-white disabled:text-white/40 flex items-center justify-center shrink-0 transition-all"
                  aria-label="Send reply"
                >
                  {isSendingReply ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </form>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 bg-white/10 border border-white/15 rounded-2xl px-4 py-2.5">
              <p className="text-xs text-white/85 font-medium">
                Log in to react or reply to this status
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/login');
                }}
                className="px-3.5 py-1.5 rounded-full bg-[#1877F2] text-white text-xs font-black shrink-0"
              >
                Log In
              </button>
            </div>
          )}
        </div>

        {/* Seen-By Viewers Sheet */}
        {showViewersSheet && isOwn && (
          <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end">
            <div className="w-full max-h-[68%] bg-white dark:bg-zinc-950 rounded-t-3xl border-t border-gray-200 dark:border-zinc-800 flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye size={18} className="text-[#1877F2]" />
                  <h4 className="font-black text-gray-900 dark:text-white text-sm">
                    Viewed by {viewers.length}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowViewersSheet(false)}
                  className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {viewers.length === 0 ? (
                  <p className="text-center text-xs text-gray-500 py-8 font-medium">
                    No views yet. Viewers will appear here in real time.
                  </p>
                ) : (
                  viewers.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => {
                        setShowViewersSheet(false);
                        onClose();
                        navigate(`/profile/${v.user_id}`);
                      }}
                      className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-gray-50 dark:hover:bg-zinc-900 cursor-pointer"
                    >
                      <ProfileAvatar
                        userId={v.user_id}
                        defaultAvatar={v.viewer_avatar}
                        name={v.viewer_name}
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-gray-900 dark:text-white truncate">
                          {v.viewer_name}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {formatRelativeStatusTime(v.viewed_at_ms)}
                        </p>
                      </div>
                      {v.reaction && (
                        <span className="text-xl px-2 py-0.5 bg-gray-100 dark:bg-zinc-800 rounded-full">
                          {v.reaction}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Auto-Delete Duration Picker Sheet */}
        {showDurationEditor && isOwn && (
          <div className="absolute inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-5">
            <div className="w-full max-w-sm bg-white dark:bg-zinc-950 rounded-3xl border border-gray-200 dark:border-zinc-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-[#1877F2]" />
                  <h4 className="font-black text-gray-900 dark:text-white text-sm">
                    Auto-Delete Timer
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDurationEditor(false)}
                  className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Choose how long this status stays live (default 24 hours, up to 7 days max).
              </p>
              <div className="space-y-2">
                {STATUS_DURATION_OPTIONS.map((opt) => {
                  const active = currentStory.duration_hours === opt.hours;
                  return (
                    <button
                      key={opt.hours}
                      type="button"
                      disabled={isMutating}
                      onClick={() => handleChangeDuration(opt.hours)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 text-left transition-all ${
                        active
                          ? 'border-[#1877F2] bg-blue-50 dark:bg-blue-950/30'
                          : 'border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-900 dark:text-white">
                          {opt.label}
                        </span>
                        {opt.badge && (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-[#1877F2] dark:text-blue-300">
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      {active && <Check size={16} className="text-[#1877F2]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && isOwn && (
          <div className="absolute inset-0 z-40 bg-black/75 backdrop-blur-sm flex items-center justify-center p-5">
            <div className="w-full max-w-xs bg-white dark:bg-zinc-950 rounded-3xl border border-gray-200 dark:border-zinc-800 p-5 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mx-auto">
                <Trash2 size={22} />
              </div>
              <div>
                <h4 className="font-black text-gray-900 dark:text-white">Delete this status?</h4>
                <p className="text-xs text-gray-500 mt-1">
                  It will be permanently removed for everyone immediately.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-200 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={handleDeleteCurrentStory}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
                >
                  {isMutating ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Next Group / Story */}
      <button
        type="button"
        onClick={goNext}
        className="hidden md:flex items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white ml-4 transition-all"
        aria-label="Next status"
      >
        <ChevronRight size={24} />
      </button>

      {/* Privacy Editor Sub-Modal */}
      <StatusPrivacyModal
        isOpen={showPrivacyEditor}
        currentUserId={currentUser?.id || ''}
        initialVisibility={currentStory.visibility}
        initialAllowedIds={currentStory.allowed_user_ids || []}
        initialExcludedIds={currentStory.excluded_user_ids || []}
        onClose={() => setShowPrivacyEditor(false)}
        onSave={handleSavePrivacyUpdate}
      />
    </div>
  );
};
