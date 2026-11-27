import { localDB, saveLocalConversation, removeLocalConversation } from "@/lib/dexie";
import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Flag, Users, Search, Trash2, Send, Smile, Paperclip, MessageSquare, ArrowLeft, Check, CheckCheck, Ban, RefreshCw, X, CornerUpLeft, EyeOff, Mic, Eye, Play, Pause, BellOff, Bell, Activity, Zap, LogOut, FileText, Music, Camera, Download, Plus, Video as VideoIcon, Image as ImageIcon, Folder, Film, SlidersHorizontal, Clock, Pin, Star, ExternalLink, Loader2 } from 'lucide-react';

const EmojiPicker = lazy(() => import('emoji-picker-react'));
import { useAuth } from '@/contexts/AuthContext';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import ZoomableImage from '@/components/ZoomableImage';
import VideoPlayer from '@/components/VideoPlayer';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { redis } from '@/lib/redis';

// Firebase imports (kept strictly for notifications & reports)
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { dualWriteMessage } from '@/lib/dbHelper';
import { safeRandomUUID } from '@/lib/safeStorage';
import { supabase } from '@/lib/supabase';
import {
  syncProfileToSupabase,
  fetchProfileSmart,
  fetchProfilesBatchSmart,
  migrateUserFriendshipsOnce,
  migrateUserMessagesOnce,
  fetchUserFriendshipsSmart,
  getFriendshipBetweenSmart,
  blockUserSmart,
  deleteFriendshipSmart,
} from '@/lib/profileSync';

const MediaEditor = lazy(() => import('../components/MediaTools').then(m => ({ default: m.MediaEditor })));
const CameraCapture = lazy(() => import('../components/MediaTools').then(m => ({ default: m.CameraCapture })));
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useUpload } from '@/contexts/UploadContext';
import ConfirmDialog from '@/components/ConfirmDialog';
import { formatTime, getSafeMessagePreview } from '@/lib/utils';
import { triggerNotification } from '@/services/notificationService';
import { useGlobalStore } from '@/store/useGlobalStore';
import { toast } from 'sonner';
import { useContentFilter } from '@/hooks/useContentFilter';
import { StatusRibbon } from '@/components/status/StatusRibbon';
import { AvatarWithStatusMenu } from '@/components/status/AvatarWithStatusMenu';

const safeFormatChatTime = (val: any) => {
  if (!val) return '';
  try {
    const d = typeof val === 'string' ? new Date(val) : val?.toDate ? val.toDate() : (typeof val === 'number' ? new Date(val) : new Date());
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch (e) {
    return '';
  }
};

const parseMessagePayload = (m: any) => {
  if (!m) return m;
  const parsed: any = { ...m };
  if (m.text && !parsed.content) {
    parsed.content = m.text;
  }
  const rawContent = parsed.content;
  if (typeof rawContent === 'string') {
    if (rawContent.includes('"JSON_PAYLOAD"') || rawContent.trim().startsWith('{')) {
      try {
        const obj = JSON.parse(rawContent);
        if (obj && typeof obj === 'object') {
          if (obj.text !== undefined) parsed.content = obj.text;
          if (obj.is_view_once !== undefined) parsed.is_view_once = obj.is_view_once;
          if (obj.parent_message_id !== undefined) parsed.parent_message_id = obj.parent_message_id;
          if (obj.filename !== undefined) parsed.filename = obj.filename;
          if (obj.file_size !== undefined) parsed.file_size = obj.file_size;
        }
      } catch (e) {}
    }
  }
  return parsed;
};

const toMillisSafe = (raw: any): number => {
  if (!raw) return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  if (raw?.toMillis && typeof raw.toMillis === 'function') {
    try { const t = raw.toMillis(); return isNaN(t) ? 0 : t; } catch (_) { return 0; }
  }
  if (raw?.seconds) {
    const t = raw.seconds * 1000;
    return isNaN(t) ? 0 : t;
  }
  if (raw instanceof Date) {
    const t = raw.getTime();
    return isNaN(t) ? 0 : t;
  }
  if (typeof raw === 'string') {
    const t = new Date(raw).getTime();
    return isNaN(t) ? 0 : t;
  }
  return 0;
};

const getChatTimestamp = (c: any): number => {
  if (!c) return 0;
  const raw =
    c.lastMessage?.created_at ||
    c.lastMessage?.local_created_at ||
    c.last_message_time ||
    c.lastMessageTime;
  return toMillisSafe(raw);
};

const sortContactsWhatsApp = (list: any[], unreadMap?: Record<string, number>, pinnedIds?: string[]) => {
  const pinnedSet = pinnedIds ? new Set(pinnedIds) : null;
  return [...list].sort((a, b) => {
    if (pinnedSet) {
      const pinA = pinnedSet.has(a.id);
      const pinB = pinnedSet.has(b.id);
      if (pinA !== pinB) return pinB ? 1 : -1;
    }

    const timeA = getChatTimestamp(a);
    const timeB = getChatTimestamp(b);
    const unreadA = (unreadMap?.[a.id] ?? a.unreadCount ?? 0) > 0;
    const unreadB = (unreadMap?.[b.id] ?? b.unreadCount ?? 0) > 0;
    const hasActivityA = timeA > 0 || unreadA;
    const hasActivityB = timeB > 0 || unreadB;

    if (hasActivityA !== hasActivityB) {
      return hasActivityB ? 1 : -1;
    }
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    if (unreadA !== unreadB) {
      return unreadB ? 1 : -1;
    }
    return (a.display_name || a.name || '').localeCompare(b.display_name || b.name || '');
  });
};

const extractFirstUrl = (text?: string): string | null => {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0] : null;
};

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👍'];

const CustomAudioPlayer = ({ src, isSender }: { src: string; isSender?: boolean }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      setProgress((audio.currentTime / audio.duration) * 100 || 0);
    };

    const updateDuration = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      if (audioRef.current) audioRef.current.currentTime = 0;
    };

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [src]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(e => console.error("Playback failed", e));
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current && duration > 0) {
      const seekTime = (Number(e.target.value) / 100) * duration;
      audioRef.current.currentTime = seekTime;
      setProgress(Number(e.target.value));
    }
  };

  const formatAudioTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const waveformBars = React.useMemo(() => {
    const seedStr = src || 'voice';
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Array.from({ length: 24 }, (_, idx) => {
      const val = Math.abs(Math.sin((h + idx * 97) * 0.13));
      return 24 + Math.round(val * 72);
    });
  }, [src]);

  const handleBarSeek = (idx: number) => {
    const pct = ((idx + 0.5) / waveformBars.length) * 100;
    if (audioRef.current && duration > 0) {
      audioRef.current.currentTime = (pct / 100) * duration;
      setProgress(pct);
    }
  };

  return (
    <div className="flex items-center gap-3 w-full min-w-[210px] sm:min-w-[250px] max-w-[290px] px-1 py-0.5">
      <audio ref={audioRef} src={src} preload="metadata" />
      
      <button 
        type="button"
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center transition-transform hover:scale-105 active:scale-95 ${isSender ? 'bg-white text-[#1877F2] shadow-sm' : 'bg-[#1877F2] text-white shadow-md'}`}
      >
        {isPlaying ? <Pause fill="currentColor" size={18} /> : <Play fill="currentColor" size={20} className="ml-0.5" />}
      </button>

      <div className="flex-1 flex flex-col justify-center">
        <div className="flex items-end gap-[2px] h-7 w-full cursor-pointer select-none" aria-label="Voice waveform">
          {waveformBars.map((heightPct, idx) => {
            const barPct = ((idx + 1) / waveformBars.length) * 100;
            const active = progress >= barPct - 2;
            return (
              <div
                key={idx}
                onClick={(e) => { e.stopPropagation(); handleBarSeek(idx); }}
                className={`flex-1 rounded-full transition-colors duration-150 ${
                  active
                    ? (isSender ? 'bg-white' : 'bg-[#1877F2]')
                    : (isSender ? 'bg-white/35' : 'bg-gray-300 dark:bg-gray-600')
                }`}
                style={{ height: `${heightPct}%` }}
              />
            );
          })}
        </div>
        <div className={`text-[11px] font-medium leading-none mt-1 flex justify-between tracking-wide tabular-nums ${isSender ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
          <span>{formatAudioTime(audioRef.current?.currentTime || 0)}</span>
          <span>{formatAudioTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};

interface MemoizedChatMessagesProps {
  messages: any[];
  visibleLimit: number;
  currentUserId?: string;
  selectedChatId?: string;
  selectedChatDisplayName?: string;
  selectedMessages: string[];
  reactionsMap: Record<string, Record<string, string[]>>;
  activeReactionMsgId: string | null;
  starredIds: Set<string>;
  isOnlineOrLive: boolean;
  onTouchStart: (id: string) => void;
  onTouchEnd: () => void;
  onTouchMove: () => void;
  onMessageClick: (id: string) => void;
  onReply: (msg: any) => void;
  onToggleReactionPicker: (msgId: string) => void;
  onToggleReaction: (msgId: string, emoji: string) => void;
  onToggleStar: (msg: any) => void;
  onDeleteMessage: (id: string) => void;
  onViewOnce: (msg: any) => void;
}

const MemoizedChatMessages = React.memo<MemoizedChatMessagesProps>(({
  messages,
  visibleLimit,
  currentUserId,
  selectedChatDisplayName,
  selectedMessages,
  reactionsMap,
  activeReactionMsgId,
  starredIds,
  isOnlineOrLive,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  onMessageClick,
  onReply,
  onToggleReactionPicker,
  onToggleReaction,
  onToggleStar,
  onDeleteMessage,
  onViewOnce,
}) => {
  const sliced = useMemo(
    () => (messages.length > visibleLimit ? messages.slice(messages.length - visibleLimit) : messages),
    [messages, visibleLimit]
  );

  const selectedSet = useMemo(() => new Set(selectedMessages), [selectedMessages]);

  return (
    <>
      {sliced.map((msg: any) => {
        const parentMsg = msg.parent_message_id ? messages.find((m: any) => m.id === msg.parent_message_id) : null;
        const msgReactions = reactionsMap[msg.id] || {};
        const reactionEntries = Object.entries(msgReactions).filter(([, users]) => users.length > 0);
        const firstUrl = !msg.is_view_once ? extractFirstUrl(msg.content) : null;
        const isStarred = starredIds.has(msg.id);
        const isOwn = msg.sender_id === currentUserId;

        return (
          <motion.div
            key={msg.id}
            onTouchStart={() => onTouchStart(msg.id)}
            onTouchEnd={onTouchEnd}
            onTouchMove={onTouchMove}
            onMouseDown={() => onTouchStart(msg.id)}
            onMouseUp={onTouchEnd}
            onMouseLeave={onTouchEnd}
            onClick={() => onMessageClick(msg.id)}
            className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group relative w-full ${selectedSet.has(msg.id) ? 'bg-blue-50/50 dark:bg-blue-900/20 rounded-lg' : ''}`}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 50) {
                onReply(msg);
              }
            }}
          >
            <div className={`opacity-0 group-hover:opacity-100 transition-all self-center flex items-center gap-1 ${isOwn ? 'mr-1.5' : 'ml-1.5 order-last'}`}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleReactionPicker(msg.id);
                }}
                className="p-1 text-gray-400 hover:text-[#1877F2] rounded-full"
                title="React"
              >
                <Smile size={15} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStar(msg);
                }}
                className={`p-1 rounded-full ${isStarred ? 'text-amber-500' : 'text-gray-400 hover:text-amber-500'}`}
                title="Star message"
              >
                <Star size={15} className={isStarred ? 'fill-amber-400' : ''} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteMessage(msg.id);
                }}
                className="p-1 text-red-300 hover:text-red-500 rounded-full"
                title={isOwn ? 'Delete for Everyone' : 'Delete for Me'}
              >
                <Trash2 size={15} />
              </button>
            </div>

            {activeReactionMsgId === msg.id && (
              <div
                onClick={(e) => e.stopPropagation()}
                className={`absolute -top-10 z-30 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full px-2 py-1 shadow-lg flex items-center gap-1 ${isOwn ? 'right-2' : 'left-2'}`}
              >
                {QUICK_REACTIONS.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onToggleReaction(msg.id, emoji)}
                    className="text-base hover:scale-125 transition-transform px-1"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col max-w-[75%]">
              <div className={`p-3.5 rounded-2xl shadow-sm text-[15px] font-medium leading-relaxed ${isOwn ? 'bg-[#1877F2] text-white rounded-tr-none' : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-tl-none'}`}>
                {parentMsg && (
                  <div className={`mb-2 p-2 rounded-xl text-xs opacity-80 border-l-4 ${isOwn ? 'bg-white/20 border-white/50 text-white' : 'bg-gray-100 dark:bg-gray-700 border-[#1877F2] text-gray-800 dark:text-gray-300'}`}>
                    <p className="font-bold mb-0.5">{parentMsg.sender_id === currentUserId ? 'You' : selectedChatDisplayName}</p>
                    <p className="line-clamp-1">{parentMsg.is_view_once ? '🔒 View Once message' : (parentMsg.content || (parentMsg.media_url ? 'Media' : ''))}</p>
                  </div>
                )}
                {msg.is_view_once ? (
                  isOwn ? (
                    <div className="flex items-center gap-2 py-1 px-2.5 bg-black/15 dark:bg-white/15 rounded-xl text-xs font-semibold select-none">
                      <div className="w-5 h-5 rounded-full border border-current flex items-center justify-center font-bold text-[10px]">1</div>
                      <span>View Once {msg.media_url ? (msg.media_type === 'audio' ? 'Voice' : msg.media_type === 'video' ? 'Video' : 'Photo') : 'Message'}</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => onViewOnce(msg)}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 rounded-xl transition-all font-bold text-sm select-none active:scale-95 shadow-sm"
                    >
                      <div className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center font-black text-xs animate-pulse">1</div>
                      {msg.media_type === 'audio' ? <Mic size={18} /> : <Eye size={18} />}
                      <span>View Once {msg.media_url ? (msg.media_type === 'audio' ? 'Voice' : msg.media_type === 'video' ? 'Video' : 'Photo') : 'Message'}</span>
                      <span className="text-[11px] font-normal opacity-75">(Tap to open)</span>
                    </button>
                  )
                ) : msg.media_url ? (
                  <div className={`mb-2 rounded-lg overflow-hidden relative ${msg.media_type === 'audio' ? 'bg-transparent overflow-visible' : 'bg-black/5 dark:bg-white/5'}`}>
                    {msg.media_type === 'image' ? (
                      <ZoomableImage src={msg.media_url} className="max-w-full h-auto rounded-lg" referrerPolicy="no-referrer" />
                    ) : msg.media_type === 'audio' ? (
                      <CustomAudioPlayer src={msg.media_url} isSender={isOwn} />
                    ) : msg.media_type === 'video' ? (
                      <VideoPlayer src={msg.media_url} className="max-w-full h-auto rounded-lg" />
                    ) : (
                      <div className="p-3 bg-black/10 dark:bg-white/10 rounded-xl flex items-center gap-3 border border-black/10 dark:border-white/10">
                        <div className="p-2.5 rounded-lg bg-blue-500/20 text-blue-500 shrink-0">
                          <FileText size={24} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold truncate text-gray-900 dark:text-white">
                            {msg.filename || msg.media_url.split('/').pop()?.split('?')[0] || 'Attachment'}
                          </p>
                          {msg.file_size && (
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">{(msg.file_size / (1024 * 1024)).toFixed(2)} MB</p>
                          )}
                          <a
                            href={msg.media_url}
                            target="_blank"
                            rel="noreferrer"
                            download={msg.filename || 'download'}
                            className="text-[11px] text-blue-500 hover:underline flex items-center gap-1 font-bold mt-1"
                          >
                            <Download size={12} /> Download File
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
                {!msg.is_view_once && msg.content && <span>{msg.content}</span>}
                {firstUrl && (() => {
                  let host = firstUrl;
                  try { host = new URL(firstUrl).hostname.replace(/^www\./, ''); } catch (_) {}
                  return (
                    <a
                      href={firstUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className={`mt-2 flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs border transition-opacity hover:opacity-90 ${
                        isOwn
                          ? 'bg-white/15 border-white/25 text-white'
                          : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-bold truncate">{host}</p>
                        <p className="text-[10px] opacity-75 truncate">{firstUrl}</p>
                      </div>
                      <ExternalLink size={14} className="shrink-0" />
                    </a>
                  );
                })()}
                <div className={`flex items-center justify-end gap-1 mt-1 ${isOwn ? 'text-blue-200' : 'text-gray-400'}`}>
                  {isStarred && <Star size={10} className="fill-amber-400 text-amber-400" />}
                  <p className="text-[10px] text-right opacity-80">
                    {formatTime(msg.created_at)}
                  </p>
                  {isOwn && (
                    msg.is_pending ? (
                      <Clock size={12} className="opacity-70" />
                    ) : msg.is_read || msg.p2p_seen ? (
                      <CheckCheck size={12} className="text-red-500" />
                    ) : isOnlineOrLive ? (
                      <CheckCheck size={12} className="text-blue-200 opacity-60" />
                    ) : (
                      <Check size={12} className="text-blue-200 opacity-60" />
                    )
                  )}
                </div>
              </div>

              {reactionEntries.length > 0 && (
                <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  {reactionEntries.map(([emoji, users]) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onToggleReaction(msg.id, emoji); }}
                      className="px-1.5 py-0.5 rounded-full text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-1"
                    >
                      <span>{emoji}</span>
                      {users.length > 1 && <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300">{users.length}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </>
  );
});

const Messages: React.FC = () => {
  const { currentUser } = useAuth();
  const { addUpload } = useUpload();
  const navigate = useNavigate();
  const location = useLocation();
  const { id: routeChatId } = useParams<{ id?: string }>();
  const queryClient = useQueryClient();
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [chatToDelete, setChatToDelete] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedChatsForAction, setSelectedChatsForAction] = useState<any[]>([]);
  const [showReportConfirm, setShowReportConfirm] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [showGroupCreate, setShowGroupCreate] = useState(false);
  const [showGroupDetails, setShowGroupDetails] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupAvatarFile, setGroupAvatarFile] = useState<File | null>(null);
  const [groupAvatarPreview, setGroupAvatarPreview] = useState('');
  const [chatViewMode, setChatViewMode] = useState<'active' | 'unread' | 'archived' | 'groups'>('active');
  const [showStatusUpdates, setShowStatusUpdates] = useState(false);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);

  // 100% Client-Side Unread Counter Map (WhatsApp-style instant UI)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>(() => {
    if (!currentUser?.id) return {};
    try {
      return JSON.parse(localStorage.getItem('unread_counts_' + currentUser.id) || '{}');
    } catch (_) {
      return {};
    }
  });

  // Pinned Chats (local persisted + instant top placement)
  const [pinnedChats, setPinnedChats] = useState<string[]>(() => {
    if (!currentUser?.id) return [];
    try {
      return JSON.parse(localStorage.getItem('pinned_chats_' + currentUser.id) || '[]');
    } catch (_) {
      return [];
    }
  });

  // Message Reactions & Starred Messages
  const [reactionsMap, setReactionsMap] = useState<Record<string, Record<string, string[]>>>(() => {
    if (!currentUser?.id) return {};
    try {
      return JSON.parse(localStorage.getItem('msg_reactions_' + currentUser.id) || '{}');
    } catch (_) {
      return {};
    }
  });
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);

  const [starredItems, setStarredItems] = useState<any[]>(() => {
    if (!currentUser?.id) return [];
    try {
      return JSON.parse(localStorage.getItem('starred_msgs_' + currentUser.id) || '[]');
    } catch (_) {
      return [];
    }
  });
  const [showStarredModal, setShowStarredModal] = useState(false);

  const [hasOlderRemote, setHasOlderRemote] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const setIsChatOpen = useGlobalStore(state => state.setIsChatOpen);
  const setActiveChatId = useGlobalStore(state => state.setActiveChatId);
  
  useEffect(() => {
    setIsChatOpen(!!selectedChat);
    setActiveChatId(selectedChat ? selectedChat.id : null);
    return () => {
      setIsChatOpen(false);
      setActiveChatId(null);
    };
  }, [selectedChat, setIsChatOpen, setActiveChatId]);

  useEffect(() => {
    if (showGroupDetails && selectedChat?.is_group) {
      const fetchMembers = async () => {
        if (!selectedChat.members || selectedChat.members.length === 0) return;
        const profMap = await fetchProfilesBatchSmart(selectedChat.members);
        const allMems = selectedChat.members
          .map((id: string) => profMap.get(id))
          .filter(Boolean);
        setGroupMembers(allMems);
      };
      fetchMembers();
    }
  }, [showGroupDetails, selectedChat]);

  const longPressTimerRef = useRef<any>(null);
  const isLongPressRef = useRef<boolean>(false);
  const activeChannelRef = useRef<any>(null);

  const [liveStatus, setLiveStatus] = useState<'inactive' | 'proposing' | 'receiving_proposal' | 'active' | 'failed'>('inactive');
  const liveStatusRef = useRef<'inactive' | 'proposing' | 'receiving_proposal' | 'active' | 'failed'>('inactive');
  useEffect(() => {
    liveStatusRef.current = liveStatus;
  }, [liveStatus]);

  const [liveText, setLiveText] = useState('');
  const liveProposalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastInputLengthRef = useRef<number>(0);
  const activeLiveStreamTextRef = useRef<string>('');
  const draftSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const sendSignalToReceiver = useCallback((receiverId: string, event: string, payload: any) => {
    if (!receiverId) return;
    try {
      const ch: any = supabase.channel(`user_notifications_${receiverId}`);
      if (typeof ch.httpSend === 'function') {
        ch.httpSend(event, payload).catch(() => {});
      } else {
        ch.send({ type: 'broadcast', event, payload }).catch(() => {});
      }
    } catch (_) {}
  }, []);

  const pendingProposalForChat = useGlobalStore((state) =>
    selectedChat?.id ? state.pendingLiveProposals[selectedChat.id] : undefined
  );

  useEffect(() => {
    if (
      selectedChat?.id &&
      pendingProposalForChat &&
      Date.now() - Number(pendingProposalForChat.timestamp || 0) < 120000
    ) {
      setLiveStatus((prev) => (prev === 'active' ? prev : 'receiving_proposal'));
    }
  }, [selectedChat?.id, pendingProposalForChat]);

  const startLiveProposal = () => {
    if (!selectedChat || !currentUser) return;
    setLiveStatus('proposing');
    const senderName = currentUser.display_name || currentUser.username || 'User';
    const usernameTag = currentUser.username ? ` (@${currentUser.username})` : '';

    const signalPayload = {
      type: 'LIVE_PROPOSAL_REQUEST',
      sender_id: currentUser.id,
      sender_name: senderName,
      sender_avatar: currentUser.avatar_url || '',
      chat_id: selectedChat.id,
      timestamp: Date.now()
    };

    // 1. Broadcast over chat room channel
    sendP2PSignal(signalPayload);

    // 2. Broadcast over receiver's dedicated notification channel via httpSend (works even without active subscription)
    sendSignalToReceiver(selectedChat.id, 'LIVE_PROPOSAL_SIGNAL', signalPayload);

    // 3. Send BOTH FCM Push Notification + In-App Notification so recipient is notified everywhere
    triggerNotification(
      selectedChat.id,
      `⚡ ${senderName}${usernameTag}`,
      'sent you a Live Typing request! Tap to accept.',
      {
        type: 'live_proposal',
        action: 'LIVE_PROPOSAL_REQUEST',
        sender_id: currentUser.id,
        sender_name: senderName,
        sender_username: currentUser.username || '',
        sender_avatar: currentUser.avatar_url || '',
        chat_id: selectedChat.id,
        url: `/messages?user=${currentUser.id}&liveProposal=1`,
        notif_id: `live_prop_${currentUser.id}_${Date.now()}`
      }
    );

    // 4. Clear existing proposal timer
    if (liveProposalTimerRef.current) clearTimeout(liveProposalTimerRef.current);

    // 5. Set 30-second timeout so recipient has plenty of time to tap push notification and accept
    liveProposalTimerRef.current = setTimeout(() => {
      setLiveStatus(prev => {
        if (prev === 'proposing') {
          toast.error('Live typing proposal timed out. Click to retry.');
          return 'failed';
        }
        return prev;
      });
    }, 30000);
  };

  const cancelLiveProposal = () => {
    if (liveProposalTimerRef.current) clearTimeout(liveProposalTimerRef.current);
    setLiveStatus('inactive');
    const cancelPayload = { type: 'LIVE_PROPOSAL_CANCEL', sender_id: currentUser?.id };
    sendP2PSignal(cancelPayload);
    if (selectedChat?.id) {
      useGlobalStore.getState().clearPendingLiveProposal(selectedChat.id);
      sendSignalToReceiver(selectedChat.id, 'LIVE_PROPOSAL_SIGNAL', cancelPayload);
    }
  };

  useEffect(() => {
    if (currentUser?.id) {
      syncProfileToSupabase(currentUser).catch(() => {});
    }
  }, [currentUser]);

  const startLongPress = (contact: any) => {
    isLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      if (!isMultiSelectMode) {
        setIsMultiSelectMode(true);
        setSelectedChatsForAction([contact]);
        if ('vibrate' in navigator) navigator.vibrate(80);
      }
    }, 800);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleItemClick = (contact: any) => {
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }
    
    if (isMultiSelectMode) {
      if (selectedChatsForAction.some(sc => sc.id === contact.id)) {
        const next = selectedChatsForAction.filter(sc => sc.id !== contact.id);
        setSelectedChatsForAction(next);
        if (next.length === 0) setIsMultiSelectMode(false);
      } else {
        setSelectedChatsForAction([...selectedChatsForAction, contact]);
      }
      return;
    }
    
    // Instant unread badge clear (WhatsApp style)
    setUnreadCounts(prev => {
      if (!prev[contact.id]) return prev;
      const next = { ...prev };
      delete next[contact.id];
      if (currentUser?.id) {
        localStorage.setItem('unread_counts_' + currentUser.id, JSON.stringify(next));
      }
      return next;
    });
    if (currentUser?.id) {
      const readKey = 'read_msg_ids_' + currentUser.id;
      const existingRead: string[] = JSON.parse(localStorage.getItem(readKey) || '[]');
      if (contact.lastMessage?.id && !existingRead.includes(contact.lastMessage.id)) {
        existingRead.push(contact.lastMessage.id);
        localStorage.setItem(readKey, JSON.stringify(existingRead.slice(-200)));
      }
      const store = useGlobalStore.getState();
      const updatedStoreMsgs = store.messages.map(m =>
        m.sender_id === contact.id && m.receiver_id === currentUser.id && m.is_read === false
          ? { ...m, is_read: true }
          : m
      );
      const newUnreadTotal = updatedStoreMsgs.filter(
        m =>
          m.is_read === false &&
          m.receiver_id === currentUser.id &&
          m.sender_id !== currentUser.id &&
          !m.deleted_for_everyone &&
          !(m.deleted_for || []).includes(currentUser.id)
      ).length;
      useGlobalStore.setState({ messages: updatedStoreMsgs, unreadMessagesCount: newUnreadTotal });
      if (!contact.is_group) {
        Promise.resolve(
          supabase
            .from('messages')
            .update({ is_read: true })
            .eq('sender_id', contact.id)
            .eq('receiver_id', currentUser.id)
            .eq('is_read', false)
        ).catch(() => {});
      }
    }

    if (selectedChat?.id !== contact.id) {
      setSelectedChat(contact);
      setIsChatOpen(true);
      setMessages([]);
    }
    if (showNewFriends) setShowNewFriends(false);
  };

  const handleDeleteChat = async (contactId: string) => {
    if (!currentUser) return;
    const toastId = toast.loading("Deleting chat...");
    try {
      // Optimistic Local Delete for instant UI update
      try {
        await localDB.messages
          .where('sender_id').equals(contactId)
          .or('receiver_id').equals(contactId)
          .delete();
        await removeLocalConversation(contactId);
      } catch (e) {
        console.warn("Failed to delete messages from localDB", e);
      }
      
      // P2P Cascade Delete
      if ((window as any).cinemaPeers) {
        Object.values((window as any).cinemaPeers).forEach((peer: any) => {
          if (peer?.open) peer.send({ type: "DELETE_SYNC", id: contactId });
        });
      }
      if ((window as any).meetPeers) {
        Object.values((window as any).meetPeers).forEach((peer: any) => {
          if (peer?.open) peer.send({ type: "DELETE_SYNC", id: contactId });
        });
      }

      // 1. Supabase atomic soft-delete (preserves other user's deleted_for array)
      try {
        const { error: rpcErr } = await supabase.rpc('mark_chat_deleted_for_user', {
          uid: currentUser.id,
          partner_id: contactId
        });

        if (rpcErr) {
          // Fallback if RPC isn't created yet
          const qBuilder = contactId.startsWith('group_')
            ? supabase.from('messages').select('id, deleted_for').eq('receiver_id', contactId)
            : supabase
                .from('messages')
                .select('id, deleted_for')
                .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${currentUser.id})`);

          const { data: rows } = await qBuilder;
          if (rows && rows.length > 0) {
            await Promise.all(
              rows.map((r: any) => {
                const merged = Array.from(new Set([...(Array.isArray(r.deleted_for) ? r.deleted_for : []), currentUser.id]));
                return supabase.from('messages').update({ deleted_for: merged }).eq('id', r.id);
              })
            );
          }
        }
      } catch (e) {
        console.warn('Supabase bulk delete failed', e);
      }

      // 3. Add to deleted_chats in localStorage to hide from inbox completely
      const deletedKey = 'deleted_chats_' + currentUser.id;
      const deletedIds = JSON.parse(localStorage.getItem(deletedKey) || '[]');
      if (!deletedIds.includes(contactId)) {
        deletedIds.push(contactId);
        localStorage.setItem(deletedKey, JSON.stringify(deletedIds));
      }

      if (selectedChat?.id === contactId) {
        setSelectedChat(null);
      }

      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success("Chat deleted successfully!", { id: toastId });
    } catch (err: any) {
      console.error("Error deleting chat:", err);
      toast.error("Failed to delete chat: " + err.message, { id: toastId });
    }
  };
  const [isMuted, setIsMuted] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const [visibleLimit, setVisibleLimit] = useState(50);

  const [inputOffset, setInputOffset] = useState(0);
  const [savedInputOffset, setSavedInputOffset] = useState(() => {
    return parseInt(localStorage.getItem('saved_keyboard_height') || '300', 10);
  });
  const [isDraggingInput, setIsDraggingInput] = useState(false);
  const dragStartYRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const lastTapRef = useRef(0);

  useEffect(() => {
    if (!isInputFocused && !isDraggingInput) {
      setInputOffset(0);
    }
  }, [isInputFocused]);

  useEffect(() => {
    const handleMove = (e: any) => {
      if (!isDraggingInput) return;
      if (e.cancelable) e.preventDefault();
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const deltaY = clientY - dragStartYRef.current;
      setInputOffset(Math.max(0, dragStartOffsetRef.current - deltaY));
    };
    const handleUp = () => {
      if (isDraggingInput) {
        setIsDraggingInput(false);
        if (inputOffset > 50) {
          setSavedInputOffset(inputOffset);
          localStorage.setItem('saved_keyboard_height', inputOffset.toString());
        } else {
          setInputOffset(0);
        }
      }
    };

    if (isDraggingInput) {
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
      document.addEventListener('touchmove', handleMove, { passive: false });
      document.addEventListener('touchend', handleUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleUp);
    };
  }, [isDraggingInput, inputOffset]);

  const longPressTimer = useRef<any>(null);
  const handleTouchStart = useCallback((id: string) => {
    longPressTimer.current = setTimeout(() => {
      if ('vibrate' in navigator) navigator.vibrate(50);
      setSelectedMessages(prev => (prev.includes(id) ? prev : [...prev, id]));
    }, 2500);
  }, []);
  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);
  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);
  const handleMessageClick = useCallback((id: string) => {
    setSelectedMessages(prev => {
      if (prev.length === 0) return prev;
      return prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id];
    });
  }, []);

  const handleInputDragStart = (e: React.TouchEvent | React.MouseEvent) => {
    setIsDraggingInput(true);
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartYRef.current = clientY;
    dragStartOffsetRef.current = inputOffset;
    if (inputRef.current) inputRef.current.blur();
    setIsInputFocused(false);
    if (e.cancelable) e.preventDefault();
  };

  useEffect(() => {
    if (selectedChat?.id && currentUser?.id) {
      const draftKey = `message_draft_${currentUser.id}_${selectedChat.id}`;
      const draft = localStorage.getItem(draftKey);
      if (draft !== null) {
        setMessageText(draft);
      } else {
        setMessageText('');
      }
    } else {
      setMessageText('');
    }
  }, [selectedChat?.id, currentUser?.id]);

  const sendP2PSignal = (payload: any) => {
    if (selectedChat) {
      // Legacy WebRTC P2P
      if ((window as any).cinemaPeers && (window as any).cinemaPeers[selectedChat.id]?.open) {
        (window as any).cinemaPeers[selectedChat.id].send(payload);
      } else if ((window as any).meetPeers && (window as any).meetPeers[selectedChat.id]?.open) {
        (window as any).meetPeers[selectedChat.id].send(payload);
      }
      
      // Supabase Realtime Broadcast (Low Latency Typing & Seen)
      if (activeChannelRef.current && useGlobalStore.getState().isSupabaseActive && !activeChannelRef.current.isFirebase) {
        activeChannelRef.current.send({
          type: 'broadcast',
          event: 'chat_signal',
          payload: { ...payload, sender_id: currentUser?.id }
        });
      }
    }
  };

  const liveTextTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMessageTextChange = (text: string) => {
    setMessageText(text);
    if (currentUser && selectedChat) {
      const draftKey = `message_draft_${currentUser.id}_${selectedChat.id}`;
      if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);
      if (text.trim() === '') {
        localStorage.removeItem(draftKey);
      } else {
        draftSaveTimeoutRef.current = setTimeout(() => {
          try { localStorage.setItem(draftKey, text); } catch (_) {}
        }, 350);
      }
      
      if (liveStatus === 'active') {
        const prevLen = lastInputLengthRef.current;
        const currLen = text.length;
        lastInputLengthRef.current = currLen;

        let streamToSend = text;
        if (currLen < prevLen) {
          const deletedCount = prevLen - currLen;
          if (text.trim() === '') {
            activeLiveStreamTextRef.current = '';
            streamToSend = '';
          } else {
            const currentStream = activeLiveStreamTextRef.current || text;
            streamToSend = currentStream.slice(deletedCount);
            activeLiveStreamTextRef.current = streamToSend;
          }
        } else {
          activeLiveStreamTextRef.current = text;
          streamToSend = text;
        }

        const now = Date.now();
        if (now - lastLiveTextSendTimeRef.current >= 30) {
          if (liveTextTimeoutRef.current) {
            clearTimeout(liveTextTimeoutRef.current);
            liveTextTimeoutRef.current = null;
          }
          sendP2PSignal({ type: 'LIVE_TEXT_STREAM', text: streamToSend, sender_id: currentUser.id });
          lastLiveTextSendTimeRef.current = now;
        } else {
          if (liveTextTimeoutRef.current) clearTimeout(liveTextTimeoutRef.current);
          liveTextTimeoutRef.current = setTimeout(() => {
            sendP2PSignal({ type: 'LIVE_TEXT_STREAM', text: streamToSend, sender_id: currentUser.id });
            lastLiveTextSendTimeRef.current = Date.now();
          }, 30);
        }
        return;
      }

      if (!isTyping) {
        setIsTyping(true);
        sendP2PSignal({ type: 'TYPING', isTyping: true });
      }
      
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        sendP2PSignal({ type: 'TYPING', isTyping: false });
      }, 2000);
    }
  };

  useEffect(() => {
    if (!currentUser?.id || !selectedChat?.id) {
      setOtherUserTyping(false);
      return;
    }
    
    // Attach listener for P2P signals
    const handleSignal = (e: CustomEvent) => {
      const { data, peerId } = e.detail;
      if (peerId === selectedChat.id) {
        if (data.type === 'TYPING') {
          setOtherUserTyping(Boolean(data.isTyping));
          if (remoteTypingTimeoutRef.current) clearTimeout(remoteTypingTimeoutRef.current);
          if (data.isTyping) {
            remoteTypingTimeoutRef.current = setTimeout(() => setOtherUserTyping(false), 3000);
          }
        } else if (data.type === 'SEEN') {
          setMessages(prev => prev.map(m => m.id === data.msgId ? { ...m, p2p_seen: true } : m));
        } else if (data.type === 'LIVE_PROPOSAL_REQUEST') {
          setLiveStatus(prev => (prev === 'active' ? prev : 'receiving_proposal'));
          sendP2PSignal({ type: 'LIVE_PROPOSAL_ACK', sender_id: currentUser?.id });
        } else if (data.type === 'LIVE_PROPOSAL_ACK') {
          // Packet acknowledged by recipient
        } else if (data.type === 'LIVE_PROPOSAL_CANCEL') {
          useGlobalStore.getState().clearPendingLiveProposal(selectedChat.id);
          setLiveStatus(prev => prev === 'receiving_proposal' ? 'inactive' : prev);
        } else if (data.type === 'LIVE_PROPOSAL_ACCEPTED') {
          if (liveProposalTimerRef.current) clearTimeout(liveProposalTimerRef.current);
          useGlobalStore.getState().clearPendingLiveProposal(selectedChat.id);
          setLiveStatus('active');
          setLiveText('');
          activeLiveStreamTextRef.current = '';
          lastInputLengthRef.current = 0;
          toast.success('⚡ Live Typing Connected!');
        } else if (data.type === 'LIVE_PROPOSAL_REJECTED' || data.type === 'LIVE_STOP') {
          if (liveProposalTimerRef.current) clearTimeout(liveProposalTimerRef.current);
          useGlobalStore.getState().clearPendingLiveProposal(selectedChat.id);
          setLiveStatus('inactive');
          setLiveText('');
          activeLiveStreamTextRef.current = '';
          lastInputLengthRef.current = 0;
        } else if (data.type === 'LIVE_TEXT_STREAM') {
          if (!data.sender_id || data.sender_id === selectedChat.id) {
            setLiveText(data.text);
          }
        }
      }
    };
    
    window.addEventListener('P2P_SIGNAL' as any, handleSignal as any);
    
    return () => {
       window.removeEventListener('P2P_SIGNAL' as any, handleSignal as any);
    };
  }, [selectedChat?.id, currentUser?.id]);

  // Clean up live typing ONLY when switching away to a different conversation ID or closing chat
  useEffect(() => {
    const activeId = selectedChat?.id;
    return () => {
      if (liveProposalTimerRef.current) clearTimeout(liveProposalTimerRef.current);
      if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);
      if (liveStatusRef.current !== 'inactive' && activeId) {
        sendP2PSignal({ type: 'LIVE_STOP', sender_id: currentUser?.id });
        sendSignalToReceiver(activeId, 'LIVE_PROPOSAL_SIGNAL', { type: 'LIVE_STOP', sender_id: currentUser?.id });
      }
      setLiveStatus('inactive');
      setLiveText('');
      activeLiveStreamTextRef.current = '';
      lastInputLengthRef.current = 0;
    };
  }, [selectedChat?.id]);

  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const { scanFile } = useContentFilter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showNewFriends, setShowNewFriends] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<{ file: File, url: string, type: 'image' | 'video' | 'audio' | 'document', name: string, size: number } | null>(null);
  const [showMediaPreviewModal, setShowMediaPreviewModal] = useState(false);
  const [mediaCaption, setMediaCaption] = useState('');
  const [isMediaViewOnce, setIsMediaViewOnce] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showCameraCapture, setShowCameraCapture] = useState(false);
  const [showMediaEditor, setShowMediaEditor] = useState(false);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedAudio, setRecordedAudio] = useState<{file: File, url: string} | null>(null);
  const [isVoiceViewOnce, setIsVoiceViewOnce] = useState(false);
  const [isTextViewOnce, setIsTextViewOnce] = useState(false);
  const [activeViewOnceMedia, setActiveViewOnceMedia] = useState<any>(null);
  
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastLiveTextSendTimeRef = useRef<number>(0);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const remoteTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const allMediaInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const openChatWithUserId = useCallback(async (targetUserId: string, hasLiveProposal = false) => {
    if (!targetUserId) return;
    try {
      // If user previously deleted this chat, opening it restores it (WhatsApp style)
      if (currentUser?.id) {
        const deletedKey = 'deleted_chats_' + currentUser.id;
        try {
          const deletedIds: string[] = JSON.parse(localStorage.getItem(deletedKey) || '[]');
          if (deletedIds.includes(targetUserId)) {
            const updated = deletedIds.filter(id => id !== targetUserId);
            localStorage.setItem(deletedKey, JSON.stringify(updated));
          }
        } catch (_) {}
      }

      // Clear unread count immediately for opened user
      setUnreadCounts(prev => {
        if (!prev[targetUserId]) return prev;
        const next = { ...prev };
        delete next[targetUserId];
        if (currentUser?.id) {
          localStorage.setItem('unread_counts_' + currentUser.id, JSON.stringify(next));
        }
        return next;
      });

      // Immediately open optimistic chat header so deep links never stall on network lookups
      const isTargetGroup = String(targetUserId).startsWith('group_');
      setSelectedChat((prev: any) =>
        prev?.id === targetUserId
          ? prev
          : {
              id: targetUserId,
              display_name: isTargetGroup ? 'Group' : 'Loading...',
              name: isTargetGroup ? 'Group' : 'Loading...',
              username: '',
              avatar_url: '',
              avatar: '',
              is_group: isTargetGroup
            }
      );
      setIsChatOpen(true);
      setActiveChatId(targetUserId);

      // Restore pending Live Typing proposal immediately if opened via notification or stored in global store
      const storedProposal = useGlobalStore.getState().pendingLiveProposals[targetUserId];
      const isProposalValid = hasLiveProposal || (storedProposal && Date.now() - Number(storedProposal.timestamp || 0) < 120000);
      if (isProposalValid) {
        if (!storedProposal) {
          useGlobalStore.getState().setPendingLiveProposal({
            senderId: targetUserId,
            senderName: 'Friend',
            timestamp: Date.now()
          });
        }
        setLiveStatus((prev) => (prev === 'active' ? prev : 'receiving_proposal'));
        if (currentUser?.id) {
          sendSignalToReceiver(targetUserId, 'LIVE_PROPOSAL_SIGNAL', { type: 'LIVE_PROPOSAL_ACK', sender_id: currentUser.id });
        }
      }

      // Check existing local conversation or user
      const [localConv, localUser] = await Promise.all([
        localDB.conversations.get(targetUserId).catch(() => null),
        localDB.users.get(targetUserId).catch(() => null)
      ]);

      if (localConv) {
        setSelectedChat({
          id: localConv.id,
          display_name: localConv.display_name || localConv.name || 'User',
          name: localConv.name || localConv.display_name || 'User',
          username: localConv.username || '',
          avatar_url: localConv.avatar_url || localConv.avatar || '',
          avatar: localConv.avatar || localConv.avatar_url || '',
          is_verified: localConv.is_verified,
          is_group: localConv.is_group
        });
        setIsChatOpen(true);
        setActiveChatId(localConv.id);
      } else if (localUser) {
        setSelectedChat({ id: localUser.id, ...localUser });
        setIsChatOpen(true);
        setActiveChatId(localUser.id);
      }

      const remoteProfile = await fetchProfileSmart(targetUserId);
      if (remoteProfile) {
        const isGrp = Boolean(remoteProfile.is_group || String(targetUserId).startsWith('group_'));
        const disp = remoteProfile.display_name || remoteProfile.name || (remoteProfile.username ? `@${remoteProfile.username}` : (isGrp ? 'Group' : 'User'));
        const resolvedChat = { id: remoteProfile.id, ...remoteProfile, display_name: disp, name: disp, is_group: isGrp };
        setSelectedChat(resolvedChat);
        setIsChatOpen(true);
        setActiveChatId(remoteProfile.id);
        localDB.users.put({ id: remoteProfile.id, username: remoteProfile?.username || '', display_name: disp, ...remoteProfile } as any).catch(() => {});
        saveLocalConversation({
          id: remoteProfile.id,
          partner_id: remoteProfile.id,
          display_name: disp,
          name: disp,
          username: remoteProfile?.username || '',
          avatar: remoteProfile?.avatar_url || remoteProfile?.avatar || '',
          avatar_url: remoteProfile?.avatar_url || remoteProfile?.avatar || '',
          is_verified: !!remoteProfile?.is_verified,
          is_group: isGrp
        }).catch(() => {});
      } else if (localUser) {
        saveLocalConversation({
          id: localUser.id,
          partner_id: localUser.id,
          display_name: localUser.display_name || localUser.name || 'User',
          name: localUser.name || localUser.display_name || 'User',
          username: localUser.username || '',
          avatar: localUser.avatar_url || localUser.avatar || '',
          avatar_url: localUser.avatar_url || localUser.avatar || '',
          is_verified: !!localUser.is_verified,
          is_group: false
        }).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    } catch (e) {
      console.warn("Failed to open chat with user:", e);
    }
  }, [setIsChatOpen, setActiveChatId, currentUser, queryClient, sendSignalToReceiver]);

  useEffect(() => {
    const handleDirectOpen = (e: any) => {
      const uId = e.detail?.userId;
      if (uId) {
        openChatWithUserId(uId, Boolean(e.detail?.liveProposal));
      }
    };
    window.addEventListener('open_chat_direct', handleDirectOpen);
    return () => {
      window.removeEventListener('open_chat_direct', handleDirectOpen);
    };
  }, [openChatWithUserId]);

  const handledDeepLinkRef = useRef<string>('');

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const stateUserId = (location.state as any)?.userId || '';
    const queryUserId = searchParams.get('user') || searchParams.get('userId') || searchParams.get('chatId') || '';
    const targetUserId = routeChatId || stateUserId || queryUserId;
    const hasLiveProposalParam = searchParams.get('liveProposal') === '1' || Boolean((location.state as any)?.liveProposal);

    if (!targetUserId) {
      handledDeepLinkRef.current = '';
      return;
    }

    const linkSig = `${location.key}|${targetUserId}|${hasLiveProposalParam}`;
    if (handledDeepLinkRef.current === linkSig) return;
    handledDeepLinkRef.current = linkSig;

    // Normalize URL & clear deep-link state BEFORE openChatWithUserId pushes { chatOpen }
    // so React Router replace/navigate does not wipe history.state.chatOpen and hardware Back returns cleanly to /messages
    if (window.location.pathname !== '/messages' || window.location.search || stateUserId) {
      window.history.replaceState({ deepLinkHandled: targetUserId }, '', '/messages');
    }

    openChatWithUserId(targetUserId, hasLiveProposalParam);
  }, [routeChatId, location.key, location.search, location.state, openChatWithUserId]);

  useEffect(() => {
    const handleUndelete = () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    };
    window.addEventListener('chat_undeleted', handleUndelete);
    return () => window.removeEventListener('chat_undeleted', handleUndelete);
  }, [queryClient]);

  useEffect(() => {
    if (!currentUser?.id) return;
    Promise.all([
      migrateUserFriendshipsOnce(currentUser.id),
      migrateUserMessagesOnce(currentUser.id)
    ])
      .then(([relChanged, msgChanged]) => {
        if (relChanged || msgChanged) {
          queryClient.invalidateQueries({ queryKey: ['contacts'] });
        }
      })
      .catch(() => {});
  }, [currentUser?.id, queryClient]);

  const { data: contacts = [], isLoading: loadingContacts } = useQuery({
    queryKey: ['contacts', chatViewMode],
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      if (!currentUser) return [];

      try {
        // 1. WhatsApp-style Local-First: Load permanent local conversations from Dexie
        const localConvs = await localDB.conversations.toArray().catch(() => []);
        const localConvsMap = new Map<string, any>();
        localConvs.forEach(c => {
          if (c && c.id) localConvsMap.set(c.id, c);
        });

        // 2. Fetch friendships (Supabase primary + automatic Firestore fallback on 22P02 UUID mismatch)
        let friendships: any[] = [];
        try {
          const { rows } = await fetchUserFriendshipsSmart(currentUser.id);
          friendships = rows;
        } catch (fErr) {
          console.warn('Friendships fetch error (handled):', fErr);
        }

        const friendIds = friendships.map(f => (f.sender_id === currentUser.id ? f.receiver_id : f.sender_id)) || [];

        // 3. Fetch groups user is a member of 100% from Supabase
        let groupIds: string[] = [];
        let fetchedGroups: any[] = [];
        try {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('is_group', true)
            .contains('members', [currentUser.id]);
          if (data) fetchedGroups = data;
          groupIds = fetchedGroups.map(g => g.id);
        } catch (gErr) {
          console.warn('Groups fetch error:', gErr);
        }

        // 4. Fetch local Dexie messages + recent Supabase messages (direct + groups)
        let localMsgs: any[] = [];
        try {
          localMsgs = await localDB.messages
            .filter((m: any) =>
              m.sender_id === currentUser.id ||
              m.receiver_id === currentUser.id ||
              groupIds.includes(m.receiver_id)
            )
            .toArray();
        } catch (dexErr) {
          console.warn('Error reading localDB.messages:', dexErr);
        }

        const messagesMap = new Map<string, any>();
        localMsgs.forEach(m => {
          if (m?.id) messagesMap.set(m.id, m);
        });

        try {
          const { data: supaDirectMsgs, error: supaErr } = await supabase
            .from('messages')
            .select('*')
            .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: false })
            .limit(120);

          if (supaErr) throw supaErr;
          (supaDirectMsgs || []).forEach((sm: any) => {
            messagesMap.set(sm.id, sm);
            localDB.messages.put(sm).catch(() => {});
          });

          if (groupIds.length > 0) {
            const { data: supaGroupMsgs } = await supabase
              .from('messages')
              .select('*')
              .in('receiver_id', groupIds)
              .order('created_at', { ascending: false })
              .limit(60);

            (supaGroupMsgs || []).forEach((gm: any) => {
              messagesMap.set(gm.id, gm);
              localDB.messages.put(gm).catch(() => {});
            });
          }
        } catch (supaErr) {
          console.warn('Supabase contacts messages query error:', supaErr);
        }

        let messages: any[] = Array.from(messagesMap.values());

        // Filter out deleted messages
        messages = messages.filter(m => !m.deleted_for_everyone && !(m.deleted_for || []).includes(currentUser.id));

        // Sort in memory newest first
        messages.sort((a, b) => toMillisSafe(b.created_at || b.local_created_at) - toMillisSafe(a.created_at || a.local_created_at));

        // 5. Build partnerMap from messages
        const partnerMap = new Map<string, any>();
        messages.forEach(m => {
          const isGroupMsg = Boolean(m.receiver_id && (String(m.receiver_id).startsWith('group_') || groupIds.includes(m.receiver_id)));
          const partnerId = isGroupMsg
            ? m.receiver_id
            : (m.sender_id === currentUser.id ? m.receiver_id : m.sender_id);
          if (!partnerId) return;

          const parsedM = parseMessagePayload(m);
          if (!partnerMap.has(partnerId)) {
            partnerMap.set(partnerId, parsedM);
          }
        });

        // If any local conversation has a real saved last_message + timestamp and partnerMap doesn't have it, fill it in
        localConvsMap.forEach((conv, cid) => {
          if (!partnerMap.has(cid)) {
            if (conv.last_message && (conv.last_message.created_at || conv.last_message_time)) {
              partnerMap.set(cid, parseMessagePayload(conv.last_message));
            } else if (conv.last_message_text && conv.last_message_time) {
              partnerMap.set(cid, parseMessagePayload({
                content: conv.last_message_text,
                sender_id: conv.last_sender_id || cid,
                created_at: conv.last_message_time
              }));
            }
          }
        });

        // 6. Combine ALL contact IDs: Local conversations + Partner IDs + Friends + Groups
        const convIds = Array.from(localConvsMap.keys());
        const partnerIds = Array.from(partnerMap.keys());
        const allContactIds = Array.from(new Set([
          ...convIds,
          ...partnerIds,
          ...friendIds,
          ...groupIds
        ])).filter(Boolean);

        if (allContactIds.length === 0) return [];

        // 7. Resolve profiles: Use localDB.conversations and localDB.users first, then Supabase (+ smart backfill if missing)
        const profilesMap = new Map<string, any>();
        const missingIds: string[] = [];

        fetchedGroups.forEach(g => {
          profilesMap.set(g.id, {
            ...g,
            display_name: g.display_name || g.name || 'Group',
            name: g.display_name || g.name || 'Group',
            avatar: g.avatar_url || g.avatar || '',
            avatar_url: g.avatar_url || g.avatar || '',
            is_group: true
          });
        });

        for (const cid of allContactIds) {
          if (profilesMap.has(cid)) continue;
          const conv = localConvsMap.get(cid);
          if (conv && (conv.display_name || conv.name || conv.username)) {
            const disp = conv.display_name || conv.name || (conv.username ? `@${conv.username}` : 'User');
            profilesMap.set(cid, {
              id: cid,
              display_name: disp,
              name: disp,
              avatar_url: conv.avatar_url || conv.avatar || '',
              avatar: conv.avatar || conv.avatar_url || '',
              username: conv.username || '',
              is_verified: !!conv.is_verified,
              is_group: !!conv.is_group
            });
            continue;
          }

          try {
            const cachedUser = await localDB.users.get(cid);
            if (cachedUser && (cachedUser.display_name || cachedUser.name || cachedUser.username)) {
              const disp = cachedUser.display_name || cachedUser.name || (cachedUser.username ? `@${cachedUser.username}` : 'User');
              profilesMap.set(cid, {
                id: cid,
                display_name: disp,
                name: disp,
                avatar_url: cachedUser.avatar_url || cachedUser.avatar || '',
                avatar: cachedUser.avatar_url || cachedUser.avatar || '',
                username: cachedUser.username || '',
                is_verified: !!cachedUser.is_verified
              });
            } else {
              missingIds.push(cid);
            }
          } catch (_) {
            missingIds.push(cid);
          }
        }

        if (missingIds.length > 0) {
          const fetchedMissing = await fetchProfilesBatchSmart(missingIds);
          fetchedMissing.forEach((d, id) => {
            const dispName = d.display_name || d.name || (d.username ? `@${d.username}` : 'User');
            const avUrl = d.avatar_url || d.avatar || '';
            const profObj = {
              id,
              display_name: dispName,
              name: dispName,
              username: d.username || '',
              avatar_url: avUrl,
              avatar: avUrl,
              is_verified: !!d.is_verified,
              is_group: !!d.is_group,
              members: d.members,
              admin_id: d.admin_id,
              email: d.email
            };
            profilesMap.set(id, profObj);
          });
        }

        const blocks = friendships.filter(f => f.status === 'blocked');

        // Compute live unread map before assembling & sorting contacts
        let readMsgIdsSet = new Set<string>();
        try {
          readMsgIdsSet = new Set(JSON.parse(localStorage.getItem('read_msg_ids_' + currentUser.id) || '[]'));
        } catch (_) {}

        const unreadFromMsgs: Record<string, number> = {};
        messages.forEach(m => {
          if (
            m.receiver_id === currentUser.id &&
            m.is_read === false &&
            m.sender_id &&
            m.sender_id !== currentUser.id &&
            !readMsgIdsSet.has(m.id) &&
            selectedChat?.id !== m.sender_id
          ) {
            unreadFromMsgs[m.sender_id] = (unreadFromMsgs[m.sender_id] || 0) + 1;
          }
        });

        // Sync unreadCounts cleanly so already-read chats clear automatically
        setUnreadCounts(() => {
          if (currentUser?.id) {
            localStorage.setItem('unread_counts_' + currentUser.id, JSON.stringify(unreadFromMsgs));
          }
          return unreadFromMsgs;
        });

        // 10. Construct full contact objects and update local conversation storage
        const contactsWithMessages = allContactIds.map((cid: string) => {
          const profile = profilesMap.get(cid) || {
            id: cid,
            display_name: 'User',
            name: 'User',
            username: '',
            avatar_url: ''
          };
          const block = blocks.find(b => 
            (b.sender_id === currentUser.id && b.receiver_id === cid) ||
            (b.sender_id === cid && b.receiver_id === currentUser.id)
          );
          const lastMsg = partnerMap.get(cid);
          const friendship = friendships.find(f => 
            (f.sender_id === currentUser.id && f.receiver_id === cid) ||
            (f.sender_id === cid && f.receiver_id === currentUser.id)
          );
          const convUnread = unreadFromMsgs[cid] || 0;

          // WhatsApp permanent save: Guarantee that every contacted user stays in IndexedDB without fabricating empty timestamps
          saveLocalConversation({
            id: cid,
            partner_id: cid,
            display_name: profile.display_name || profile.name || 'User',
            name: profile.name || profile.display_name || 'User',
            username: profile.username || '',
            avatar: profile.avatar || profile.avatar_url || '',
            avatar_url: profile.avatar_url || profile.avatar || '',
            is_verified: !!profile.is_verified,
            is_group: !!profile.is_group,
            ...(lastMsg ? {
              last_message: lastMsg,
              last_message_text: lastMsg.content || lastMsg.text || '',
              last_message_time: lastMsg.created_at || ''
            } : {}),
            unread_count: convUnread
          }).catch(() => {});
          
          return {
            ...profile,
            lastMessage: lastMsg,
            last_message_time: lastMsg?.created_at || '',
            unreadCount: convUnread,
            isNewFriend: !lastMsg && friendship?.status === 'pending',
            isFriend: friendship?.status === 'accepted',
            blockStatus: block ? {
              iBlockedThem: block.sender_id === currentUser.id,
              theyBlockedMe: block.sender_id === cid
            } : null
          };
        });

        // 11. Filter for deleted, unread, groups, or archived chats
        const deletedIds = JSON.parse(localStorage.getItem('deleted_chats_' + currentUser?.id) || '[]');
        const archivedIds = JSON.parse(localStorage.getItem('archived_chats') || '[]');
        const filteredForDeletion = contactsWithMessages.filter(c => {
          if (deletedIds.includes(c.id)) return false;
          if (chatViewMode === 'archived') return archivedIds.includes(c.id);
          if (chatViewMode === 'groups') return c.is_group && !archivedIds.includes(c.id);
          if (chatViewMode === 'unread') return (c.unreadCount || 0) > 0 && !archivedIds.includes(c.id);
          return !archivedIds.includes(c.id);
        });

        // 12. Sort strictly WhatsApp-style: Pinned -> Active/recent/unread chats strictly on top, newest first
        const sortedContacts = sortContactsWhatsApp(filteredForDeletion, unreadFromMsgs, pinnedChats);

        return sortedContacts;
      } catch (err) {
        console.error("Critical contacts query error (handled gracefully):", err);
        return [];
      }
    },
    enabled: !!currentUser,
    staleTime: 60 * 1000, 
    gcTime: Infinity,
  });

  const [messages, setMessages] = useState<any[]>([]);

  const loadOlderRemoteMessages = useCallback(async (scrollContainer: HTMLElement | null) => {
    if (!selectedChat || !currentUser || loadingOlder || !hasOlderRemote || messages.length === 0) return;
    setLoadingOlder(true);
    const oldHeight = scrollContainer?.scrollHeight || 0;
    try {
      const oldestMsg = messages[0];
      const oldestTime = oldestMsg?.created_at || new Date().toISOString();
      let supaQuery = supabase.from('messages').select('*');
      if (selectedChat.is_group) {
        supaQuery = supaQuery.eq('receiver_id', selectedChat.id);
      } else {
        supaQuery = supaQuery.or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedChat.id}),and(sender_id.eq.${selectedChat.id},receiver_id.eq.${currentUser.id})`);
      }
      const { data: olderRaw, error } = await supaQuery
        .lt('created_at', oldestTime)
        .order('created_at', { ascending: false })
        .limit(40);

      if (!error && olderRaw) {
        if (olderRaw.length < 40) setHasOlderRemote(false);
        if (olderRaw.length > 0) {
          const chatId = selectedChat.is_group
            ? selectedChat.id
            : [currentUser.id, selectedChat.id].sort().join('_');
          const parsedOlder = olderRaw.reverse().map((m: any) => ({
            ...parseMessagePayload({ ...m, content: m.content || m.text }),
            chat_id: chatId,
            chatId: chatId,
          })).filter((m: any) => !m.deleted_for_everyone && !(m.deleted_for || []).includes(currentUser.id));

          setMessages(prev => {
            const existingIds = new Set(prev.map(x => x.id));
            const uniqueOlder = parsedOlder.filter(x => !existingIds.has(x.id));
            if (uniqueOlder.length === 0) return prev;
            setVisibleLimit(v => v + uniqueOlder.length);
            return [...uniqueOlder, ...prev];
          });
          localDB.messages.bulkPut(parsedOlder).catch(() => {});
          setTimeout(() => {
            if (scrollContainer) {
              scrollContainer.scrollTop = scrollContainer.scrollHeight - oldHeight;
            }
          }, 0);
        }
      }
    } catch (_) {
    } finally {
      setLoadingOlder(false);
    }
  }, [selectedChat, currentUser, loadingOlder, hasOlderRemote, messages]);

  const handleScroll = (e: any) => {
    if (e.target.scrollTop <= 20) {
      if (messages.length > visibleLimit) {
        const oldHeight = e.target.scrollHeight;
        setVisibleLimit(prev => prev + 50);
        setTimeout(() => {
          e.target.scrollTop = e.target.scrollHeight - oldHeight;
        }, 0);
      } else if (hasOlderRemote && !loadingOlder && messages.length > 0) {
        loadOlderRemoteMessages(e.target);
      }
    }
  };

  useEffect(() => {
    let unsub1: any;
    let unsub2: any;
    
    if (!selectedChat || !currentUser) {
      setMessages([]);
      setVisibleLimit(50);
      setIsMuted(false);
      return;
    }
    
    setVisibleLimit(50);
    setHasOlderRemote(true);
    setActiveReactionMsgId(null);
    setIsMuted(localStorage.getItem(`muted_${selectedChat.id}`) === 'true');

    const mergeIncomingMessages = (incomingMsgs: any[]) => {
      if (!incomingMsgs || incomingMsgs.length === 0) return;

      let finalDataToProcess: any[] = [];

      setMessages(prev => {
        const combined = [...prev, ...incomingMsgs];
        
        const uniqueMap = new Map<string, any>();
        combined.forEach(m => {
          const msgId = m.id || m.tempId || `${m.sender_id}_${m.created_at}`;
          if (uniqueMap.has(msgId)) {
            const existing = uniqueMap.get(msgId);
            if (existing.id?.startsWith('temp-') && !m.id?.startsWith('temp-')) {
               uniqueMap.set(msgId, m);
            } else {
               uniqueMap.set(msgId, { ...existing, ...m });
            }
          } else {
            uniqueMap.set(msgId, m);
          }
        });
        
        const data = Array.from(uniqueMap.values());
        data.sort((a, b) => {
          const timeA = new Date(a.created_at || 0).getTime();
          const timeB = new Date(b.created_at || 0).getTime();
          return timeA - timeB;
        });

        const finalData = data
          .filter((m: any) => !m.deleted_for_everyone && !(m.deleted_for || []).includes(currentUser.id))
          .map((m: any) => {
          let parsed: any = { ...m };
          if (typeof m.content === 'string') {
            if (m.content.includes('"JSON_PAYLOAD"')) {
              try {
                const obj = JSON.parse(m.content);
                parsed.content = obj.text;
                parsed.is_view_once = obj.is_view_once;
                parsed.parent_message_id = obj.parent_message_id;
                parsed.filename = obj.filename;
                parsed.file_size = obj.file_size;
              } catch(e) {}
            } else if (m.content.startsWith('{')) {
              try {
                const obj = JSON.parse(m.content);
                if (obj.text !== undefined) parsed.content = obj.text;
                if (obj.filename) parsed.filename = obj.filename;
                if (obj.file_size) parsed.file_size = obj.file_size;
              } catch(e) {}
            }
          }
          return parsed;
        });
        
        finalDataToProcess = finalData;
        return finalData;
      });

      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'auto' }), 50);

      // Async write to Dexie - guaranteed non-blocking UI
      import('@/lib/dexie').then(({ localDB }) => {
         const toSave = incomingMsgs.map(m => {
            const chatIdStr = m.chat_id || m.chatId || [m.sender_id, m.receiver_id].sort().join('_');
            const createdAtStr = typeof m.created_at === 'string' ? m.created_at : (m.created_at?.toDate ? m.created_at.toDate().toISOString() : new Date().toISOString());
            return {
              ...m,
              id: m.id || m.tempId,
              chat_id: chatIdStr,
              chatId: chatIdStr,
              created_at: createdAtStr
            };

         });
         
         if (toSave.length > 0) {
           localDB.messages.bulkPut(toSave as any).catch(e => console.warn("Dexie bulkPut error in Messages:", e));
         }
      }).catch(console.warn);

      // Check for incoming unread messages and mark them as read
      const unreadCount = finalDataToProcess.filter((m: any) => m.sender_id === selectedChat.id && !m.is_read).length;
      if (unreadCount > 0) {
        // Play notification sound and vibrate
        const isLocallyMuted = localStorage.getItem(`muted_${selectedChat.id}`) === 'true';
        if (!isLocallyMuted) {
          try {
            if ('vibrate' in navigator) navigator.vibrate(200);
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContext) {
              const ctx = new AudioContext();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.type = 'sine';
              osc.frequency.setValueAtTime(600, ctx.currentTime);
              osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.1);
              gain.gain.setValueAtTime(0, ctx.currentTime);
              gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
              gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
              osc.start(ctx.currentTime);
              osc.stop(ctx.currentTime + 0.5);
            }
          } catch(e) {}
        }

        queryClient.invalidateQueries({ queryKey: ['unreadCounts'] });
        queryClient.invalidateQueries({ queryKey: ['totalUnread'] });
      }

      const unreadIds = finalDataToProcess
        .filter((m: any) => m.sender_id === selectedChat.id && !m.is_read)
        .map((m: any) => m.id);

      if (unreadIds.length > 0) {
        sendP2PSignal({ type: 'SEEN', msgIds: unreadIds });
        Promise.resolve(supabase.from('messages').update({ is_read: true }).in('id', unreadIds)).catch(console.warn);
        unreadIds.forEach(id => {
          localDB.messages.update(id, { is_read: true }).catch(() => {});
        });
        const store = useGlobalStore.getState();
        const readSet = new Set(unreadIds);
        const updatedStoreMsgs = store.messages.map(m => (readSet.has(m.id) ? { ...m, is_read: true } : m));
        const newUnread = updatedStoreMsgs.filter(
          m =>
            m.is_read === false &&
            m.receiver_id === currentUser.id &&
            m.sender_id !== currentUser.id &&
            !m.deleted_for_everyone &&
            !(m.deleted_for || []).includes(currentUser.id)
        ).length;
        useGlobalStore.setState({ messages: updatedStoreMsgs, unreadMessagesCount: newUnread });
      }
    };

    let realtimeChannel: any = null;

    const initializeChat = async () => {
      const chatId = selectedChat.is_group
        ? selectedChat.id
        : [currentUser.id, selectedChat.id].sort().join('_');

      // 1. WhatsApp-Style Dexie IndexedDB 0ms Instant Cache Load
      let cachedMessages: any[] = [];
      try {
        if (selectedChat.is_group) {
          cachedMessages = await localDB.messages
            .filter((m: any) => m.receiver_id === selectedChat.id)
            .toArray();
        } else {
          cachedMessages = await localDB.messages
            .filter((m: any) =>
              (m.sender_id === currentUser.id && m.receiver_id === selectedChat.id) ||
              (m.sender_id === selectedChat.id && m.receiver_id === currentUser.id) ||
              m.chat_id === chatId ||
              m.chatId === chatId
            )
            .toArray();
        }

        if (cachedMessages.length > 0) {
          cachedMessages.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
          mergeIncomingMessages(cachedMessages);
        }
      } catch (e) {
        console.warn('Error reading local Dexie cache:', e);
      }

      // Determine latest cached timestamp for incremental/delta fetch
      let lastTimestamp: string | null = null;
      if (cachedMessages.length > 0) {
        const latest = cachedMessages[cachedMessages.length - 1];
        if (latest && latest.created_at) {
          lastTimestamp = typeof latest.created_at === 'string' ? latest.created_at : new Date(latest.created_at).toISOString();
        }
      }

      // 2. Incremental Remote Sync from Supabase (100% Supabase)
      try {
        let supaQuery = supabase.from('messages').select('*');
        if (selectedChat.is_group) {
          supaQuery = supaQuery.eq('receiver_id', selectedChat.id);
        } else {
          supaQuery = supaQuery.or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedChat.id}),and(sender_id.eq.${selectedChat.id},receiver_id.eq.${currentUser.id})`);
        }

        if (lastTimestamp) {
          supaQuery = supaQuery.gt('created_at', lastTimestamp).order('created_at', { ascending: true });
        } else {
          supaQuery = supaQuery.order('created_at', { ascending: false }).limit(50);
        }

        const { data: supaMsgs, error: supaErr } = await supaQuery;
        if (!supaErr && supaMsgs) {
          const rawList = lastTimestamp ? supaMsgs : supaMsgs.reverse();
          const parsed = rawList.map((m: any) => ({
            ...m,
            content: m.content || m.text,
            chat_id: chatId,
            chatId: chatId,
            created_at: m.created_at || new Date().toISOString()
          }));

          if (parsed.length > 0) {
            mergeIncomingMessages(parsed);
            localDB.messages.bulkPut(parsed).catch(console.warn);
          }
        }
      } catch (err) {
        console.warn('Supabase conversation fetch error:', err);
      }

      // 3. Setup Supabase Realtime Channel with WebSocket Broadcast & Postgres Changes
      const channelId = `chat:${chatId}`;
      realtimeChannel = supabase.channel(channelId, {
        config: {
          broadcast: { ack: false, self: false },
          presence: { key: currentUser.id }
        }
      });

      realtimeChannel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages'
          },
          (payload: any) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const item = payload.new;
              if (!item) return;
              const isMatch = selectedChat.is_group
                ? item.receiver_id === selectedChat.id
                : (item.sender_id === currentUser.id && item.receiver_id === selectedChat.id) ||
                  (item.sender_id === selectedChat.id && item.receiver_id === currentUser.id);

              if (!isMatch) return;

              const isDeletedForMe = item.deleted_for_everyone || (Array.isArray(item.deleted_for) && item.deleted_for.includes(currentUser.id));
              if (isDeletedForMe) {
                setMessages(prev => prev.filter(m => m.id !== item.id && m.tempId !== item.id));
                localDB.messages.delete(item.id).catch(console.warn);
                return;
              }

              const formatted = {
                id: item.id,
                ...item,
                content: item.content || item.text,
                chat_id: chatId,
                chatId: chatId,
                created_at: item.created_at || new Date().toISOString()
              };
              mergeIncomingMessages([formatted]);
              localDB.messages.put(formatted).catch(console.warn);
              if (item.sender_id === selectedChat.id && item.receiver_id === currentUser.id && !item.is_read) {
                sendP2PSignal({ type: 'SEEN', msgIds: [item.id] });
                Promise.resolve(supabase.from('messages').update({ is_read: true }).eq('id', item.id)).catch(console.warn);
              }
            } else if (payload.eventType === 'DELETE') {
              const deletedId = payload.old?.id;
              if (deletedId) {
                setMessages(prev => prev.filter(m => m.id !== deletedId && m.tempId !== deletedId));
                localDB.messages.delete(deletedId).catch(console.warn);
              }
            }
          }
        )
        .on('broadcast', { event: 'chat_signal' }, (payload: any) => {
          const data = payload?.payload;
          if (!data) return;

          if (data.type === 'TYPING' && data.sender_id === selectedChat.id) {
            setOtherUserTyping(Boolean(data.isTyping));
            if (remoteTypingTimeoutRef.current) clearTimeout(remoteTypingTimeoutRef.current);
            if (data.isTyping) {
              remoteTypingTimeoutRef.current = setTimeout(() => setOtherUserTyping(false), 3000);
            }
          } else if (data.type === 'SEEN') {
            const seenIds: string[] = Array.isArray(data.msgIds) ? data.msgIds : (data.msgId ? [data.msgId] : []);
            if (seenIds.length > 0) {
              const setObj = new Set(seenIds);
              setMessages(prev => prev.map(m => (setObj.has(m.id) || setObj.has(m.tempId)) ? { ...m, is_read: true, p2p_seen: true } : m));
              seenIds.forEach(id => localDB.messages.update(id, { is_read: true }).catch(() => {}));
            } else {
              setMessages(prev => prev.map(m => m.sender_id === currentUser.id ? { ...m, is_read: true, p2p_seen: true } : m));
            }
          } else if (data.type === 'DELETE_MESSAGE') {
            const delId = data.msgId;
            if (delId) {
              setMessages(prev => prev.filter(m => m.id !== delId && m.tempId !== delId));
              localDB.messages.delete(delId).catch(console.warn);
            }
          } else if (data.type === 'NEW_MESSAGE_BROADCAST') {
            if (data.message) {
              const partnerId = data.message.sender_id === currentUser?.id ? data.message.receiver_id : data.message.sender_id;
              const isCurrentActive = selectedChat && selectedChat.id === data.message.sender_id;

              if (isCurrentActive) {
                const incoming = {
                  ...data.message,
                  chat_id: chatId,
                  chatId: chatId
                };
                mergeIncomingMessages([incoming]);
                localDB.messages.put(incoming).catch(console.warn);
                sendP2PSignal({ type: 'SEEN', msgIds: [incoming.id] });
              } else if (data.message.sender_id && data.message.sender_id !== currentUser?.id) {
                setUnreadCounts(prev => {
                  const next = { ...prev, [data.message.sender_id]: (prev[data.message.sender_id] || 0) + 1 };
                  if (currentUser?.id) {
                    localStorage.setItem('unread_counts_' + currentUser.id, JSON.stringify(next));
                  }
                  return next;
                });
              }

              saveLocalConversation({
                id: partnerId,
                partner_id: partnerId,
                last_message: data.message,
                last_message_text: data.message.content || data.message.text || '',
                last_message_time: data.message.created_at || Date.now()
              }).catch(console.warn);

              queryClient.setQueryData(['contacts', chatViewMode], (oldContacts: any[] | undefined) => {
                if (!Array.isArray(oldContacts)) return oldContacts;
                const idx = oldContacts.findIndex(c => c.id === partnerId);
                if (idx > -1) {
                  const target = {
                    ...oldContacts[idx],
                    lastMessage: data.message,
                    last_message_time: data.message.created_at || Date.now()
                  };
                  return [target, ...oldContacts.filter((_, i) => i !== idx)];
                }
                return oldContacts;
              });
            }
          } else if (data.type === 'LIVE_PROPOSAL_REQUEST') {
            setLiveStatus('receiving_proposal');
            sendP2PSignal({ type: 'LIVE_PROPOSAL_ACK', sender_id: currentUser?.id });
          } else if (data.type === 'LIVE_PROPOSAL_ACK') {
            // ACK
          } else if (data.type === 'LIVE_PROPOSAL_CANCEL') {
            setLiveStatus(prev => prev === 'receiving_proposal' ? 'inactive' : prev);
          } else if (data.type === 'LIVE_PROPOSAL_ACCEPTED') {
            if (liveProposalTimerRef.current) clearTimeout(liveProposalTimerRef.current);
            setLiveStatus('active');
            setLiveText('');
            activeLiveStreamTextRef.current = '';
            lastInputLengthRef.current = 0;
            toast.success('⚡ Live Typing Connected!');
          } else if (data.type === 'LIVE_PROPOSAL_REJECTED' || data.type === 'LIVE_STOP') {
            if (liveProposalTimerRef.current) clearTimeout(liveProposalTimerRef.current);
            setLiveStatus('inactive');
            setLiveText('');
            activeLiveStreamTextRef.current = '';
            lastInputLengthRef.current = 0;
          } else if (data.type === 'LIVE_TEXT_STREAM') {
            if (!data.sender_id || data.sender_id === selectedChat.id) {
              setLiveText(data.text);
            }
          } else if (data.type === 'MESSAGE_REACTION' && data.msgId && data.emoji && data.userId) {
            setReactionsMap(prev => {
              const msgReacts = { ...(prev[data.msgId] || {}) };
              const users = new Set(msgReacts[data.emoji] || []);
              if (data.removed) users.delete(data.userId);
              else users.add(data.userId);
              if (users.size === 0) delete msgReacts[data.emoji];
              else msgReacts[data.emoji] = Array.from(users);
              const next = { ...prev, [data.msgId]: msgReacts };
              if (currentUser?.id) localStorage.setItem('msg_reactions_' + currentUser.id, JSON.stringify(next));
              return next;
            });
          }
        })
        .subscribe((status: string, err: any) => {
          console.log(`🔌 [Chat Realtime Channel Status]: ${status}`, err || '');
        });

      activeChannelRef.current = {
        isCombined: true,
        send: (payload: any) => {
          if (realtimeChannel) {
            try {
              realtimeChannel.send(payload);
            } catch (e) {
              console.warn('Realtime send warning:', e);
            }
          }
        },
        unsub: () => {
          if (realtimeChannel) supabase.removeChannel(realtimeChannel);
        }
      };
    };

    initializeChat();

    return () => {
      if (activeChannelRef.current && activeChannelRef.current.unsub) {
        if (typeof activeChannelRef.current.unsub === 'function') activeChannelRef.current.unsub();
      }
      activeChannelRef.current = null;
    };
  }, [selectedChat?.id, currentUser?.id]);

  const { data: blockData = null } = useQuery({
    queryKey: ['blockStatus', currentUser?.id, selectedChat?.id],
    queryFn: async () => {
      if (!selectedChat || !currentUser || selectedChat.is_group) return null;
      const rel = await getFriendshipBetweenSmart(currentUser.id, selectedChat.id);
      return rel?.status === 'blocked' ? rel : null;
    },
    enabled: !!selectedChat && !!currentUser,
  });

  const isBlocked = !!blockData;
  const iBlockedThem = (blockData as any)?.sender_id === currentUser?.id;
  const theyBlockedMe = (blockData as any)?.sender_id === selectedChat?.id;

  const isBlockedByMe = iBlockedThem;

  // Keep Inbox contacts & unread counts strictly synced with global store messages
  const storeMessages = useGlobalStore((state) => state.messages);
  useEffect(() => {
    if (!currentUser?.id || !Array.isArray(storeMessages) || storeMessages.length === 0) return;

    let readSet = new Set<string>();
    try {
      readSet = new Set(JSON.parse(localStorage.getItem('read_msg_ids_' + currentUser.id) || '[]'));
    } catch (_) {}

    const latestByPartner = new Map<string, any>();
    const unreadByPartner: Record<string, number> = {};

    storeMessages.forEach((rawMsg: any) => {
      if (!rawMsg || rawMsg.deleted_for_everyone || (Array.isArray(rawMsg.deleted_for) && rawMsg.deleted_for.includes(currentUser.id))) {
        return;
      }
      const isGrp = String(rawMsg.receiver_id || '').startsWith('group_');
      const partnerId = isGrp
        ? rawMsg.receiver_id
        : (rawMsg.sender_id === currentUser.id ? rawMsg.receiver_id : rawMsg.sender_id);
      if (!partnerId) return;

      const parsed = parseMessagePayload(rawMsg);
      const prevLatest = latestByPartner.get(partnerId);
      if (!prevLatest || toMillisSafe(parsed.created_at) > toMillisSafe(prevLatest.created_at)) {
        latestByPartner.set(partnerId, parsed);
      }

      if (
        rawMsg.receiver_id === currentUser.id &&
        rawMsg.is_read === false &&
        rawMsg.sender_id &&
        rawMsg.sender_id !== currentUser.id &&
        !readSet.has(rawMsg.id) &&
        selectedChat?.id !== rawMsg.sender_id
      ) {
        unreadByPartner[rawMsg.sender_id] = (unreadByPartner[rawMsg.sender_id] || 0) + 1;
      }
    });

    setUnreadCounts(prev => {
      const next = { ...unreadByPartner };
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      const changed = prevKeys.length !== nextKeys.length || nextKeys.some(k => prev[k] !== next[k]);
      if (!changed) return prev;
      localStorage.setItem('unread_counts_' + currentUser.id, JSON.stringify(next));
      return next;
    });

    const modesToSync: Array<'active' | 'unread' | 'archived' | 'groups'> = Array.from(new Set(['active', chatViewMode]));
    modesToSync.forEach(mode => {
      queryClient.setQueryData(['contacts', mode], (old: any) => {
        if (!Array.isArray(old)) return old;
        const updated = old.map((c: any) => {
          const storeLast = latestByPartner.get(c.id);
          const currentLastTime = getChatTimestamp(c);
          const storeLastTime = storeLast ? toMillisSafe(storeLast.created_at) : 0;
          const nextLast = storeLastTime > currentLastTime ? storeLast : c.lastMessage;
          return {
            ...c,
            lastMessage: nextLast,
            last_message_time: nextLast?.created_at || c.last_message_time || '',
            unreadCount: unreadByPartner[c.id] || 0
          };
        });
        return sortContactsWhatsApp(updated, unreadByPartner, pinnedChats);
      });
    });
  }, [storeMessages, currentUser?.id, selectedChat?.id, chatViewMode, queryClient, pinnedChats]);

  // Realtime Listeners (100% Supabase)
  useEffect(() => {
    if (!currentUser) return;

    const promoteContact = (partnerId: string, rawMsg: any) => {
      const parsedMsg = parseMessagePayload(rawMsg);
      const msgTime = parsedMsg.created_at || new Date().toISOString();
      const modes: Array<'active' | 'unread' | 'archived' | 'groups'> = Array.from(new Set(['active', chatViewMode]));

      let foundInActive = false;
      modes.forEach((mode) => {
        queryClient.setQueryData(['contacts', mode], (old: any) => {
          if (!Array.isArray(old)) return old;
          const idx = old.findIndex((c: any) => c.id === partnerId);
          if (idx > -1) {
            if (mode === 'active') foundInActive = true;
            const nextList = [...old];
            const updatedChat = {
              ...nextList[idx],
              isNewFriend: false,
              lastMessage: parsedMsg,
              last_message_time: msgTime,
              lastMessageTime: msgTime,
            };
            nextList[idx] = updatedChat;
            return sortContactsWhatsApp(nextList, unreadCounts, pinnedChats);
          }
          return old;
        });
      });

      saveLocalConversation({
        id: partnerId,
        partner_id: partnerId,
        last_message: parsedMsg,
        last_message_text: parsedMsg.content || parsedMsg.text || '',
        last_message_time: msgTime,
        last_sender_id: parsedMsg.sender_id
      }).catch(() => {});

      if (!foundInActive) {
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
      }
    };

    const globalMessagesChannel = supabase
      .channel(`global-messages:${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        (payload: any) => {
          const newMsg = payload.new || payload.old;
          if (!newMsg) return;
          const isGroup = String(newMsg.receiver_id || '').startsWith('group_');
          const involvesMe = newMsg.sender_id === currentUser.id || newMsg.receiver_id === currentUser.id || isGroup;
          if (!involvesMe) return;

          const partnerId = isGroup
            ? newMsg.receiver_id
            : (newMsg.sender_id === currentUser.id ? newMsg.receiver_id : newMsg.sender_id);

          if (payload.eventType === 'INSERT') {
            // Auto-restore deleted chat if incoming message arrives
            if (partnerId) {
              try {
                const deletedKey = 'deleted_chats_' + currentUser.id;
                const deletedIds: string[] = JSON.parse(localStorage.getItem(deletedKey) || '[]');
                if (deletedIds.includes(partnerId)) {
                  localStorage.setItem(deletedKey, JSON.stringify(deletedIds.filter(id => id !== partnerId)));
                }
              } catch (_) {}
            }

            // Increment live unread count if message is for me & chat is not open
            if (newMsg.receiver_id === currentUser.id && newMsg.sender_id !== currentUser.id && newMsg.is_read === false) {
              const isOpenNow = selectedChat?.id === newMsg.sender_id;
              if (!isOpenNow) {
                setUnreadCounts(prev => {
                  const next = { ...prev, [newMsg.sender_id]: (prev[newMsg.sender_id] || 0) + 1 };
                  localStorage.setItem('unread_counts_' + currentUser.id, JSON.stringify(next));
                  return next;
                });
              }
            }

            if (partnerId) {
              promoteContact(partnerId, newMsg);
            }
            queryClient.invalidateQueries({ queryKey: ['unreadCounts'] });
            queryClient.invalidateQueries({ queryKey: ['notifications', currentUser.id] });
          } else if (payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
            if (payload.eventType === 'UPDATE' && newMsg.is_read === true && newMsg.receiver_id === currentUser.id && newMsg.sender_id) {
              queryClient.invalidateQueries({ queryKey: ['contacts'] });
            } else if (newMsg.deleted_for_everyone || (Array.isArray(newMsg.deleted_for) && newMsg.deleted_for.includes(currentUser.id)) || payload.eventType === 'DELETE') {
              queryClient.invalidateQueries({ queryKey: ['contacts'] });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
        },
        (payload: any) => {
          const row = payload.new || payload.old;
          if (
            !row ||
            !row.sender_id ||
            row.sender_id === currentUser.id ||
            row.receiver_id === currentUser.id
          ) {
            queryClient.invalidateQueries({ queryKey: ['contacts'] });
            queryClient.invalidateQueries({ queryKey: ['blockStatus'] });
            queryClient.invalidateQueries({ queryKey: ['isBlockedByMe'] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(globalMessagesChannel);
    };
  }, [currentUser?.id, chatViewMode, selectedChat?.id, queryClient]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/ogg;codecs=opus',
        'audio/webm'
      ];
      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType || undefined,
        audioBitsPerSecond: 128000
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: selectedMimeType || 'audio/webm' });
        
        let fileExt = 'webm';
        if (selectedMimeType.includes('mp4')) fileExt = 'mp4';
        else if (selectedMimeType.includes('ogg')) fileExt = 'ogg';

        const audioFile = new File([audioBlob], `voice_message.${fileExt}`, { type: selectedMimeType || 'audio/webm' });
        
        setRecordedAudio({
          file: audioFile,
          url: URL.createObjectURL(audioBlob)
        });
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Error accessing microphone:", err);
      if (err.message === "MediaDevicesNotSupported") {
         alert("Microphone is not supported in this environment or connection is not secure. Please open the app in a new tab.");
      } else if (err.name === 'NotAllowedError' || err.message.includes('Permission denied')) {
         alert("Microphone access is denied. Please unblock it by clicking the lock icon (🔒) or settings (⚙️) icon next to the browser's address bar, and allow microphone permissions. You may need to refresh the page after changing the setting.");
      } else {
         alert("Could not access microphone: " + err.message);
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleCancelAudio = () => {
    setRecordedAudio(null);
    setIsVoiceViewOnce(false);
  };

  const handleSendAudio = () => {
    if (!recordedAudio || !selectedChat) return;

    const uploadData = recordedAudio.file;
    const payloadExtra = { JSON_PAYLOAD: true, text: '', is_view_once: isVoiceViewOnce, parent_message_id: replyingTo?.id || null };
    const chatId = selectedChat.is_group
      ? selectedChat.id
      : [currentUser!.id, selectedChat.id].sort().join('_');
    const nowIso = new Date().toISOString();
    const newMessage: any = {
       chat_id: chatId,
       sender_id: currentUser!.id,
       receiver_id: selectedChat.id,
       content: JSON.stringify(payloadExtra),
       media_url: '',
       media_type: 'audio',
       created_at: nowIso,
       local_created_at: nowIso
    };
    
    // Add optimistic UI to messages immediately
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      ...newMessage,
      id: tempId,
      created_at: new Date().toISOString(),
      is_read: false,
      content: '',
      media_url: recordedAudio.url,
      is_view_once: payloadExtra.is_view_once,
      parent_message_id: payloadExtra.parent_message_id,
      is_pending: true
    };
    
    setMessages((prev: any[]) => [...prev, optimisticMsg]);
    queryClient.setQueryData(['messages', selectedChat.id], (old: any) => [...(old || []), optimisticMsg]);

    ['active', chatViewMode].forEach((mode) => {
      queryClient.setQueryData(['contacts', mode], (old: any) => {
        if (!Array.isArray(old)) return old;
        const newContacts = [...old];
        const chatIdx = newContacts.findIndex((c: any) => c.id === selectedChat.id);
        const parsedLast = { ...optimisticMsg, content: '', media_type: 'audio' };
        if (chatIdx > -1) {
          const chat = { ...newContacts[chatIdx], isNewFriend: false };
          chat.lastMessage = parsedLast;
          chat.last_message_time = nowIso;
          chat.lastMessageTime = nowIso;
          newContacts[chatIdx] = chat;
        } else if (mode === 'active') {
          const chat = { ...selectedChat, isNewFriend: false };
          chat.lastMessage = parsedLast;
          chat.last_message_time = nowIso;
          chat.lastMessageTime = nowIso;
          newContacts.unshift(chat);
        }
        return sortContactsWhatsApp(newContacts);
      });
    });

    addUpload(uploadData, 'message', {
        payload: newMessage,
        receiver_id: selectedChat.id,
        sender_id: currentUser!.id,
        sender_name: currentUser?.display_name || currentUser?.username || 'User',
        sender_username: currentUser?.username || '',
        sender_avatar: currentUser?.avatar_url || '',
        onSuccess: async () => {
            setMessages((prev: any[]) => prev.map(m => m.id === tempId ? { ...m, is_pending: false } : m));
            queryClient.invalidateQueries({ queryKey: ['messages', selectedChat.id] });
            // Avoid fetching contacts repeatedly
            queryClient.invalidateQueries({ queryKey: ['notifications', selectedChat.id] });
        }
    });
    
    setReplyingTo(null);
    setRecordedAudio(null);
    setIsVoiceViewOnce(false);
  };

  const handleViewOnce = async (msg: any) => {
    setActiveViewOnceMedia(msg);
    try {
      if (msg.id && !msg.id.startsWith('temp-')) {
        await supabase.from('messages').delete().eq('id', msg.id);
        await localDB.messages.delete(msg.id).catch(() => {});
      }
    } catch (e) {
      console.warn('Failed to instantly delete view once message:', e);
    }
  };

  const closeViewOnce = async (forcedMsg?: any) => {
    const msg = forcedMsg || activeViewOnceMedia;
    setActiveViewOnceMedia(null);
    if (!msg) return;

    // Optimistically remove from state and cache
    setMessages((prev: any[]) => prev.filter(m => m.id !== msg.id));
    queryClient.setQueryData(['messages', selectedChat?.id], (old: any) => {
      if (!old) return old;
      return old.filter((m: any) => m.id !== msg.id);
    });

    if (currentUser && selectedChat) {
      const cacheKey = `messages_cache_${[currentUser.id, selectedChat.id].sort().join('_')}`;
      try { await redis.del(cacheKey); } catch (e) {}
    }
    queryClient.invalidateQueries({ queryKey: ['messages', selectedChat?.id] });
  };

  // Intercept browser back button for selectedChat on mobile (keyed strictly by chat ID to prevent duplicate history entries)
  const selectedChatId = selectedChat?.id || null;
  useEffect(() => {
    if (!selectedChatId) return;
    const stateId = 'chat_' + selectedChatId;
    if (window.history.state?.chatOpen !== stateId) {
      window.history.pushState({ chatOpen: stateId }, '');
    }
    const handlePopState = (e: PopStateEvent) => {
      if (!e.state || e.state.chatOpen !== stateId) {
        setSelectedChat(null);
        setIsChatOpen(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [selectedChatId, setIsChatOpen]);

  const handleBackToSidebar = () => {
    setSelectedChat(null);
    setIsChatOpen(false);
    if (window.history.state?.chatOpen) {
      window.history.back();
    }
  };

  // Intercept browser back button for activeViewOnceMedia
  const activeViewOnceMediaRef = useRef(activeViewOnceMedia);
  useEffect(() => {
    activeViewOnceMediaRef.current = activeViewOnceMedia;
  }, [activeViewOnceMedia]);

  useEffect(() => {
    if (!activeViewOnceMedia) return;
    if (!window.history.state?.viewOnceOpen) {
      window.history.pushState({ ...window.history.state, viewOnceOpen: true }, '');
    }
    const handlePopState = (e: PopStateEvent) => {
      if (!e.state || !e.state.viewOnceOpen) {
        if (activeViewOnceMediaRef.current) {
           closeViewOnce(activeViewOnceMediaRef.current);
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [activeViewOnceMedia]);

  const handleCloseViewOnce = () => {
    if (window.history.state?.viewOnceOpen) {
      window.history.back();
    } else {
      closeViewOnce();
    }
  };

  const handleToggleMute = () => {
    if (!selectedChat) return;
    const newState = !isMuted;
    setIsMuted(newState);
    if (newState) {
      localStorage.setItem(`muted_${selectedChat.id}`, 'true');
    } else {
      localStorage.removeItem(`muted_${selectedChat.id}`);
    }
  };

  const handleBlockUser = async () => {
    if (!selectedChat || !currentUser?.id) return;

    const existingRow = await getFriendshipBetweenSmart(currentUser.id, selectedChat.id);

    if (existingRow?.status === 'blocked') {
      if (existingRow.sender_id !== currentUser.id) {
        toast.error('This user has blocked you.');
        return;
      }
      if (confirm(`Are you sure you want to unblock ${selectedChat.display_name}?`)) {
        await deleteFriendshipSmart(existingRow.id);
        queryClient.invalidateQueries({ queryKey: ['blockStatus'] });
        queryClient.invalidateQueries({ queryKey: ['isBlockedByMe'] });
        queryClient.invalidateQueries({ queryKey: ['friends'] });
        queryClient.invalidateQueries({ queryKey: ['blockedUsers'] });
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
        toast.success('User unblocked');
      }
    } else {
      if (confirm(`Are you sure you want to block ${selectedChat.display_name}?`)) {
        await blockUserSmart(currentUser.id, selectedChat.id, existingRow?.id);
        queryClient.invalidateQueries({ queryKey: ['blockStatus'] });
        queryClient.invalidateQueries({ queryKey: ['isBlockedByMe'] });
        queryClient.invalidateQueries({ queryKey: ['friends'] });
        queryClient.invalidateQueries({ queryKey: ['blockedUsers'] });
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
        toast.success('User blocked');
      }
    }
  };

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'auto' }); }, [messages]);

  useEffect(() => {
    const handleResize = () => {
      scrollRef.current?.scrollIntoView({ behavior: 'auto' });
    };
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    } else {
      window.addEventListener('resize', handleResize);
    }
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      } else {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, [selectedChat]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedChat || isBlocked) return;
    
    const isViewOnceMsg = isTextViewOnce;
    const payloadExtra = { JSON_PAYLOAD: true, text: messageText, is_view_once: isViewOnceMsg, parent_message_id: replyingTo?.id || null };

    const msgRefId = safeRandomUUID();
    const chatId = selectedChat.is_group
      ? selectedChat.id
      : [currentUser!.id, selectedChat.id].sort().join('_');
    const localCreatedAt = new Date().toISOString();

    const newMessage: any = {
       id: msgRefId,
       chat_id: chatId,
       chatId: chatId,
       sender_id: currentUser!.id,
       receiver_id: selectedChat.id,
       content: JSON.stringify(payloadExtra),
       created_at: localCreatedAt,
       local_created_at: localCreatedAt,
       is_read: false
    };

    // Optimistic UI update using real ID
    const optimisticMsg = {
      ...newMessage,
      content: payloadExtra.text,
      is_view_once: payloadExtra.is_view_once,
      parent_message_id: payloadExtra.parent_message_id,
      created_at: localCreatedAt,
      is_pending: true
    };

    setMessages(prev => {
      // Remove any temporary duplicates just in case
      const filtered = prev.filter(m => m.id !== msgRefId);
      return [...filtered, optimisticMsg];
    });
    
    queryClient.setQueryData(['messages', selectedChat.id], (old: any) => {
      const filtered = (old || []).filter((m: any) => m.id !== msgRefId);
      return [...filtered, optimisticMsg];
    });

    Array.from(new Set(['active', chatViewMode])).forEach((mode) => {
      queryClient.setQueryData(['contacts', mode], (old: any) => {
        if (!Array.isArray(old)) return old;
        const newContacts = [...old];
        const chatIdx = newContacts.findIndex((c: any) => c.id === selectedChat.id);
        if (chatIdx > -1) {
          const chat = { ...newContacts[chatIdx], isNewFriend: false };
          chat.lastMessage = optimisticMsg;
          chat.last_message_time = localCreatedAt;
          chat.lastMessageTime = localCreatedAt;
          newContacts[chatIdx] = chat;
        } else if (mode === 'active') {
          const chat = { ...selectedChat, isNewFriend: false };
          chat.lastMessage = optimisticMsg;
          chat.last_message_time = localCreatedAt;
          chat.lastMessageTime = localCreatedAt;
          newContacts.unshift(chat);
        }
        return sortContactsWhatsApp(newContacts);
      });
    });

    handleMessageTextChange('');
    setReplyingTo(null);
    setShowEmojiPicker(false);
    setIsTextViewOnce(false);

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('OFFLINE_QUEUED');
      }
      // Pass the fully formed message (with real ID) to dual write
      await dualWriteMessage(newMessage);
      
      setMessages(prev => prev.map(m => m.id === msgRefId ? { ...m, is_pending: false } : m));
      
      // Instant peer-to-peer delivery over Supabase Broadcast
      sendP2PSignal({ type: 'NEW_MESSAGE_BROADCAST', message: optimisticMsg });
      
      // Trigger Push & In-App Notification with strict View-Once privacy masking
      try {
        const senderName = currentUser?.display_name || currentUser?.username || 'User';
        const senderUsername = currentUser?.username || '';
        const usernameTag = senderUsername ? ` (@${senderUsername})` : '';
        const senderTitle = `${senderName}${usernameTag}`;
        const safeNotifBody = getSafeMessagePreview({ content: messageText, is_view_once: isViewOnceMsg });
        const notifPayload = {
          type: 'message',
          notif_id: msgRefId,
          sender_id: currentUser?.id,
          sender_name: senderName,
          sender_username: senderUsername,
          sender_avatar: currentUser?.avatar_url || '',
          chat_id: selectedChat.id,
          url: `/messages?user=${currentUser?.id}`,
          is_view_once: isViewOnceMsg,
          content: safeNotifBody
        };

        if (!selectedChat.is_group) {
          addDoc(collection(db, 'notifications'), {
            user_id: selectedChat.id,
            notif_id: msgRefId,
            sender_id: currentUser?.id,
            sender_name: senderName,
            sender_username: senderUsername,
            sender_avatar: currentUser?.avatar_url || '',
            type: 'message',
            is_view_once: isViewOnceMsg,
            content: safeNotifBody,
            is_read: false,
            created_at: new Date().toISOString()
          }).catch((err) => console.warn('Notification doc write warning:', err));

          triggerNotification(
            selectedChat.id,
            senderTitle,
            safeNotifBody,
            notifPayload
          );
        } else if (selectedChat.members && Array.isArray(selectedChat.members)) {
          selectedChat.members.forEach((memberId: string) => {
            if (memberId !== currentUser?.id) {
              addDoc(collection(db, 'notifications'), {
                user_id: memberId,
                notif_id: msgRefId,
                sender_id: currentUser?.id,
                sender_name: senderName,
                sender_username: senderUsername,
                sender_avatar: currentUser?.avatar_url || '',
                type: 'message',
                is_view_once: isViewOnceMsg,
                content: `[${selectedChat.name || 'Group'}]: ${safeNotifBody}`,
                group_id: selectedChat.id,
                is_read: false,
                created_at: new Date().toISOString()
              }).catch(() => {});

              triggerNotification(
                memberId,
                `${senderTitle} in ${selectedChat.name || 'Group'}`,
                safeNotifBody,
                { ...notifPayload, url: `/messages?user=${selectedChat.id}`, group_id: selectedChat.id }
              );
            }
          });
        }
      } catch (notifErr) {
        console.error('Notification failed:', notifErr);
      }

      const cacheKey = `messages_cache_${chatId}`;
      try { await redis.del(cacheKey); } catch (e) {}
      
      // Avoid fetching contacts repeatedly
      queryClient.invalidateQueries({ queryKey: ['notifications', selectedChat.id] });

    } catch(e: any) {
      // Queue in offline outbox for automatic retry when connectivity returns
      try {
        const outboxKey = 'offline_outbox_' + currentUser!.id;
        const queued = JSON.parse(localStorage.getItem(outboxKey) || '[]');
        queued.push({ newMessage, optimisticMsg });
        localStorage.setItem(outboxKey, JSON.stringify(queued.slice(-50)));
        toast.info('Offline — message queued to send automatically');
      } catch (_) {
        toast.error('Failed to send message: ' + e.message);
      }
    }
  };

  // Auto-flush Offline Message Outbox when online
  useEffect(() => {
    if (!currentUser?.id) return;
    const flushOutbox = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const outboxKey = 'offline_outbox_' + currentUser.id;
      let queued: any[] = [];
      try {
        queued = JSON.parse(localStorage.getItem(outboxKey) || '[]');
      } catch (_) {}
      if (!Array.isArray(queued) || queued.length === 0) return;

      const remaining: any[] = [];
      for (const item of queued) {
        try {
          await dualWriteMessage(item.newMessage);
          setMessages(prev => prev.map(m => m.id === item.newMessage.id ? { ...m, is_pending: false } : m));
        } catch (_) {
          remaining.push(item);
        }
      }
      localStorage.setItem(outboxKey, JSON.stringify(remaining));
      if (remaining.length < queued.length) {
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
      }
    };
    flushOutbox();
    window.addEventListener('online', flushOutbox);
    return () => window.removeEventListener('online', flushOutbox);
  }, [currentUser?.id, queryClient]);

  const toggleReaction = useCallback((msgId: string, emoji: string) => {
    if (!currentUser?.id) return;
    let removed = false;
    setReactionsMap(prev => {
      const msgReacts = { ...(prev[msgId] || {}) };
      const users = new Set(msgReacts[emoji] || []);
      if (users.has(currentUser.id)) {
        users.delete(currentUser.id);
        removed = true;
      } else {
        users.add(currentUser.id);
      }
      if (users.size === 0) delete msgReacts[emoji];
      else msgReacts[emoji] = Array.from(users);
      const next = { ...prev, [msgId]: msgReacts };
      try { localStorage.setItem('msg_reactions_' + currentUser.id, JSON.stringify(next)); } catch (_) {}
      return next;
    });
    setActiveReactionMsgId(null);
    sendP2PSignal({ type: 'MESSAGE_REACTION', msgId, emoji, userId: currentUser.id, removed });
  }, [currentUser?.id]);

  const toggleStarMessage = useCallback((msg: any) => {
    if (!currentUser?.id || !msg?.id) return;
    setStarredItems(prev => {
      const exists = prev.some(s => s.id === msg.id);
      const next = exists
        ? prev.filter(s => s.id !== msg.id)
        : [
            {
              id: msg.id,
              chatName: selectedChat?.display_name || 'Chat',
              chatId: selectedChat?.id || '',
              preview: getSafeMessagePreview(msg),
              created_at: msg.created_at || new Date().toISOString()
            },
            ...prev
          ];
      try { localStorage.setItem('starred_msgs_' + currentUser.id, JSON.stringify(next.slice(0, 100))); } catch (_) {}
      toast.success(exists ? 'Removed from Starred' : 'Message starred');
      return next;
    });
  }, [currentUser?.id, selectedChat?.display_name, selectedChat?.id]);

  const handleEmojiClick = (emojiData: any) => {
    setMessageText(prev => prev + emojiData.emoji);
  };

  const processIncomingFile = async (file: File, inputEl?: HTMLInputElement | null) => {
    const isVid = file.type.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|3gp|flv|wmv|m4v)$/i.test(file.name);
    const isAud = file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|opus|flac|m4r)$/i.test(file.name);
    const isImg = file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic|bmp|svg)$/i.test(file.name);

    // Ultra-strict AI Content Scanning for Chat Media
    if (isImg || isVid) {
      const isSafe = await scanFile(file, inputEl);
      if (!isSafe) {
        return;
      }
    }

    const type: 'image' | 'video' | 'audio' | 'document' = isVid ? 'video' : isAud ? 'audio' : isImg ? 'image' : 'document';
    const url = URL.createObjectURL(file);

    setSelectedMedia({
      file,
      url,
      type,
      name: file.name,
      size: file.size
    });
    setMediaType(type === 'video' ? 'video' : 'image');
    setMediaCaption('');
    setIsMediaViewOnce(false);
    setShowMediaPreviewModal(true);
    setShowAttachMenu(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processIncomingFile(file, e.target);
    e.target.value = '';
  };

  const handleSendMediaPreview = async () => {
    if (!selectedMedia || !selectedChat || !currentUser) return;

    setShowMediaPreviewModal(false);
    const fileToSend = selectedMedia.file;
    const currentType = selectedMedia.type;
    const isViewOnce = isMediaViewOnce;
    const caption = mediaCaption.trim();

    const payloadExtra = {
      JSON_PAYLOAD: true,
      text: caption,
      is_view_once: isViewOnce,
      parent_message_id: replyingTo?.id || null,
      filename: selectedMedia.name,
      file_size: selectedMedia.size
    };

    const chatId = selectedChat.is_group
      ? selectedChat.id
      : [currentUser.id, selectedChat.id].sort().join('_');
    const nowIso = new Date().toISOString();
    const newMessage: any = {
      chat_id: chatId,
      sender_id: currentUser.id,
      receiver_id: selectedChat.id,
      content: JSON.stringify(payloadExtra),
      media_url: '',
      media_type: currentType,
      created_at: nowIso,
      local_created_at: nowIso
    };

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      ...newMessage,
      id: tempId,
      created_at: new Date().toISOString(),
      is_read: false,
      content: caption,
      media_url: selectedMedia.url,
      media_type: currentType,
      is_view_once: isViewOnce,
      parent_message_id: payloadExtra.parent_message_id,
      filename: selectedMedia.name,
      file_size: selectedMedia.size,
      is_pending: true
    };
    
    setMessages((prev: any[]) => [...prev, optimisticMsg]);
    queryClient.setQueryData(['messages', selectedChat.id], (old: any) => [...(old || []), optimisticMsg]);

    Array.from(new Set(['active', chatViewMode])).forEach((mode) => {
      queryClient.setQueryData(['contacts', mode], (old: any) => {
        if (!Array.isArray(old)) return old;
        const newContacts = [...old];
        const idx = newContacts.findIndex((c: any) => c.id === selectedChat.id);
        if (idx > -1) {
          newContacts[idx] = { ...newContacts[idx], isNewFriend: false, lastMessage: optimisticMsg, last_message_time: nowIso };
        } else if (mode === 'active') {
          newContacts.unshift({ ...selectedChat, isNewFriend: false, lastMessage: optimisticMsg, last_message_time: nowIso });
        }
        return sortContactsWhatsApp(newContacts);
      });
    });

    addUpload(fileToSend, 'message', {
      payload: newMessage,
      receiver_id: selectedChat.id,
      sender_id: currentUser.id,
      sender_name: currentUser?.display_name || currentUser?.username || 'User',
      sender_username: currentUser?.username || '',
      sender_avatar: currentUser?.avatar_url || '',
      onSuccess: async () => {
        setMessages((prev: any[]) => prev.map(m => m.id === tempId ? { ...m, is_pending: false } : m));
        queryClient.invalidateQueries({ queryKey: ['messages', selectedChat.id] });
      }
    });

    setSelectedMedia(null);
    setReplyingTo(null);
    setMediaCaption('');
    setIsMediaViewOnce(false);
  };

  const handleMediaSave = async (processedUrl: string, isViewOnce: boolean) => {
    setShowMediaEditor(false);
    if (!selectedChat || !currentUser) return;
    
    let file: File;
    try {
      const resp = await fetch(processedUrl);
      const blob = await resp.blob();
      const isVid = selectedMedia?.type === 'video';
      file = new File([blob], `media_${Date.now()}.${isVid ? 'mp4' : 'jpg'}`, { type: blob.type || (isVid ? 'video/mp4' : 'image/jpeg') });
    } catch (e) {
      file = selectedMedia?.file || new File([], 'media');
    }
    
    const caption = mediaCaption.trim();
    const currentType = selectedMedia?.type || 'image';
    const payloadExtra = {
      JSON_PAYLOAD: true,
      text: caption,
      is_view_once: isViewOnce,
      parent_message_id: replyingTo?.id || null,
      filename: selectedMedia?.name || file.name,
      file_size: file.size
    };

    const chatId = selectedChat.is_group
      ? selectedChat.id
      : [currentUser.id, selectedChat.id].sort().join('_');
    const nowIso = new Date().toISOString();
    const newMessage: any = {
      chat_id: chatId,
      sender_id: currentUser.id,
      receiver_id: selectedChat.id,
      content: JSON.stringify(payloadExtra),
      media_url: '',
      media_type: currentType,
      created_at: nowIso,
      local_created_at: nowIso
    };

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      ...newMessage,
      id: tempId,
      created_at: new Date().toISOString(),
      is_read: false,
      content: caption,
      media_url: processedUrl,
      media_type: currentType,
      is_view_once: isViewOnce,
      parent_message_id: payloadExtra.parent_message_id,
      filename: payloadExtra.filename,
      file_size: payloadExtra.file_size,
      is_pending: true
    };
    
    setMessages((prev: any[]) => [...prev, optimisticMsg]);
    queryClient.setQueryData(['messages', selectedChat.id], (old: any) => [...(old || []), optimisticMsg]);

    Array.from(new Set(['active', chatViewMode])).forEach((mode) => {
      queryClient.setQueryData(['contacts', mode], (old: any) => {
        if (!Array.isArray(old)) return old;
        const newContacts = [...old];
        const idx = newContacts.findIndex((c: any) => c.id === selectedChat.id);
        if (idx > -1) {
          newContacts[idx] = { ...newContacts[idx], isNewFriend: false, lastMessage: optimisticMsg, last_message_time: nowIso };
        } else if (mode === 'active') {
          newContacts.unshift({ ...selectedChat, isNewFriend: false, lastMessage: optimisticMsg, last_message_time: nowIso });
        }
        return sortContactsWhatsApp(newContacts);
      });
    });

    addUpload(file, 'message', {
      payload: newMessage,
      receiver_id: selectedChat.id,
      sender_id: currentUser.id,
      sender_name: currentUser?.display_name || currentUser?.username || 'User',
      sender_username: currentUser?.username || '',
      sender_avatar: currentUser?.avatar_url || '',
      onSuccess: async () => {
        setMessages((prev: any[]) => prev.map(m => m.id === tempId ? { ...m, is_pending: false } : m));
        queryClient.invalidateQueries({ queryKey: ['messages', selectedChat.id] });
      }
    });

    setSelectedMedia(null);
    setReplyingTo(null);
    setMediaCaption('');
    setIsMediaViewOnce(false);
  };

  const triggerDeleteMessage = useCallback((id: string) => {
    setDeleteConfirmId(id);
  }, []);

  const starredIdSet = useMemo(() => new Set(starredItems.map(s => s.id)), [starredItems]);
  const handleToggleReactionPicker = useCallback((msgId: string) => {
    setActiveReactionMsgId(prev => (prev === msgId ? null : msgId));
  }, []);

  const executeDeleteMessage = async () => {
    if (!deleteConfirmId || !currentUser) return;
    const id = deleteConfirmId;
    const targetMsg = messages.find((m: any) => m.id === id || m.tempId === id);
    const isOwnMessage = targetMsg?.sender_id === currentUser.id;
    setDeleteConfirmId(null);

    // 1. Instant optimistic delete from UI state
    setMessages((prev: any[]) => prev.filter(msg => msg.id !== id && msg.tempId !== id));

    if (selectedChat) {
      queryClient.setQueryData(['messages', selectedChat.id], (oldData: any[]) => {
        if (!oldData) return oldData;
        return oldData.filter(msg => msg.id !== id && msg.tempId !== id);
      });
    }

    // 2. Delete locally from Dexie IndexedDB
    try {
      await localDB.messages.delete(id);
    } catch (e) {}

    // 3. Delete in Supabase (delete for everyone if own message, else soft-delete for self)
    try {
      if (isOwnMessage) {
        sendP2PSignal({ type: 'DELETE_MESSAGE', msgId: id });
        await supabase.from('messages').delete().eq('id', id);
      } else {
        const { error: rpcErr } = await supabase.rpc('mark_messages_deleted_for_user', {
          msg_ids: [id],
          uid: currentUser.id
        });
        if (rpcErr) {
          const { data: row } = await supabase.from('messages').select('deleted_for').eq('id', id).maybeSingle();
          const merged = Array.from(new Set([...(Array.isArray(row?.deleted_for) ? row.deleted_for : []), currentUser.id]));
          await supabase.from('messages').update({ deleted_for: merged }).eq('id', id);
        }
      }

      toast.success('Message deleted');

      if (selectedChat && currentUser) {
        const cacheKey = `messages_cache_${[currentUser.id, selectedChat.id].sort().join('_')}`;
        try { await redis.del(cacheKey); } catch (e) {}
      }
    } catch (error: any) {
      console.error('Delete message error:', error);
    }
  };

  const handleDeleteForMe = async () => {
    const idsToDelete = selectedMessages;
    setSelectedMessages([]);
    setDeleteConfirmId(null);
    if (!idsToDelete.length || !currentUser) return;

    // 1. Instant optimistic delete from UI state
    setMessages((prev: any[]) => prev.filter(msg => !idsToDelete.includes(msg.id)));

    if (selectedChat) {
      queryClient.setQueryData(['messages', selectedChat.id], (oldData: any[]) => {
        if (!oldData) return oldData;
        return oldData.filter(msg => !idsToDelete.includes(msg.id));
      });
    }

    try {
      // 2. Delete locally from Dexie
      try {
        await localDB.messages.bulkDelete(idsToDelete);
      } catch (e) {}

      // 3. Atomic append in Supabase
      const { error: rpcErr } = await supabase.rpc('mark_messages_deleted_for_user', {
        msg_ids: idsToDelete,
        uid: currentUser.id
      });

      if (rpcErr) {
        const { data: rows } = await supabase.from('messages').select('id, deleted_for').in('id', idsToDelete);
        if (rows && rows.length > 0) {
          await Promise.all(
            rows.map((r: any) => {
              const merged = Array.from(new Set([...(Array.isArray(r.deleted_for) ? r.deleted_for : []), currentUser.id]));
              return supabase.from('messages').update({ deleted_for: merged }).eq('id', r.id);
            })
          );
        }
      }

      if (selectedChat) {
        queryClient.invalidateQueries({ queryKey: ['messages', selectedChat.id] });
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleDeleteForEveryone = async () => {
    const idsToDelete = selectedMessages;
    setSelectedMessages([]);
    setDeleteConfirmId(null);
    if (!idsToDelete.length) return;

    // 1. Instant optimistic delete from UI state
    setMessages((prev: any[]) => prev.filter(msg => !idsToDelete.includes(msg.id)));

    if (selectedChat) {
      queryClient.setQueryData(['messages', selectedChat.id], (oldData: any[]) => {
        if (!oldData) return oldData;
        return oldData.filter(msg => !idsToDelete.includes(msg.id));
      });
    }

    // 2. Broadcast delete event to peer for each message
    idsToDelete.forEach(id => {
      sendP2PSignal({ type: 'DELETE_MESSAGE', msgId: id });
    });

    try {
      // 3. Delete from Dexie
      try {
        await localDB.messages.bulkDelete(idsToDelete);
      } catch (e) {}

      // 4. Delete 100% from Supabase
      await supabase.from('messages').delete().in('id', idsToDelete);

      if (selectedChat && currentUser) {
        const cacheKey = `messages_cache_${[currentUser.id, selectedChat.id].sort().join('_')}`;
        try { await redis.del(cacheKey); } catch (e) {}
        queryClient.invalidateQueries({ queryKey: ['messages', selectedChat.id] });
      }
    } catch (error) {
      console.error(error);
      queryClient.invalidateQueries({ queryKey: ['messages', selectedChat?.id] });
    }
  };

  return (
    <div id="chat-page-container" className="flex flex-1 md:flex-row min-h-0 h-full w-full bg-white dark:bg-black md:rounded-xl shadow-xl border-x-0 md:border border-gray-200 dark:border-gray-800 max-w-[1200px] mx-auto overflow-hidden">
      {/* Contact Sidebar */}
      <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} min-h-0 w-full md:w-[350px] border-r border-gray-100 dark:border-gray-800 flex flex-col bg-gray-50/50 dark:bg-black/50`}>
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-black sticky top-0 z-20">
          
          {isMultiSelectMode ? (
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <button onClick={() => { setIsMultiSelectMode(false); setSelectedChatsForAction([]); }} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                  <X size={20} />
                </button>
                <span className="font-bold">{selectedChatsForAction.length} Selected</span>
              </div>
              <div className="flex items-center gap-2">
                {selectedChatsForAction.length === 1 && (
                  <button onClick={() => setShowReportConfirm(true)} className="p-2 text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded-full" title="Report">
                    <Flag size={18} />
                  </button>
                )}
                {selectedChatsForAction.length === 1 && !selectedChatsForAction[0].is_group && (
                  <button onClick={async () => {
                     const toBlock = selectedChatsForAction[0].id;
                     if (currentUser?.id && toBlock) {
                       await blockUserSmart(currentUser.id, toBlock);
                       queryClient.invalidateQueries({ queryKey: ['contacts'] });
                       queryClient.invalidateQueries({ queryKey: ['friends'] });
                       queryClient.invalidateQueries({ queryKey: ['blockedUsers'] });
                     }
                     toast.success('User blocked');
                     setIsMultiSelectMode(false); setSelectedChatsForAction([]);
                  }} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full" title="Block">
                    <Ban size={18} />
                  </button>
                )}
                {selectedChatsForAction.length === 1 && (
                  <button onClick={() => { setChatToDelete(selectedChatsForAction[0]); setShowDeleteConfirm(true); setIsMultiSelectMode(false); setSelectedChatsForAction([]); }} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full" title="Delete">
                    <Trash2 size={18} />
                  </button>
                )}
                <button onClick={() => {
                  const targetIds = selectedChatsForAction.map(c => c.id);
                  const allPinned = targetIds.every(id => pinnedChats.includes(id));
                  const next = allPinned
                    ? pinnedChats.filter(id => !targetIds.includes(id))
                    : Array.from(new Set([...targetIds, ...pinnedChats]));
                  setPinnedChats(next);
                  if (currentUser?.id) {
                    localStorage.setItem('pinned_chats_' + currentUser.id, JSON.stringify(next));
                  }
                  toast.success(allPinned ? 'Unpinned' : 'Pinned to top');
                  setIsMultiSelectMode(false);
                  setSelectedChatsForAction([]);
                  queryClient.invalidateQueries({ queryKey: ['contacts'] });
                }} className="p-2 text-[#1877F2] hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full" title="Pin / Unpin">
                  <Pin size={18} />
                </button>
                <button onClick={() => {
                  const toAction = selectedChatsForAction.map(c => c.id);
                  let archived = JSON.parse(localStorage.getItem('archived_chats') || '[]');
                  if (chatViewMode === 'active') {
                    archived = [...new Set([...archived, ...toAction])];
                    toast.success('Chats archived');
                  } else {
                    archived = archived.filter((id) => !toAction.includes(id));
                    toast.success('Chats unarchived');
                  }
                  localStorage.setItem('archived_chats', JSON.stringify(archived));
                  setIsMultiSelectMode(false); setSelectedChatsForAction([]);
                  queryClient.invalidateQueries({ queryKey: ['contacts'] });
                }} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full" title={chatViewMode === 'active' ? "Archive" : "Unarchive"}>
                  {chatViewMode === 'active' ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
                {selectedChatsForAction.length >= 1 && (
                  <button onClick={() => setShowGroupCreate(true)} className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full" title="Create Group">
                    <Users size={18} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-3">
                <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                  {showStatusUpdates ? 'Status Updates' : showNewFriends ? 'New Friends' : chatViewMode === 'archived' ? 'Archived' : chatViewMode === 'groups' ? 'Groups' : chatViewMode === 'unread' ? 'Unread' : 'Chats'}
                </h1>
                <button
                  type="button"
                  onClick={() => setShowStarredModal(true)}
                  className="p-2 rounded-full text-gray-500 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                  title="Starred Messages"
                >
                  <Star size={18} className={starredItems.length > 0 ? 'fill-amber-400 text-amber-500' : ''} />
                </button>
              </div>

              <div className="bg-[#f0f2f5] dark:bg-gray-900 rounded-full flex items-center px-4 py-2 border border-transparent focus-within:border-blue-300 transition-all mb-3">
                <Search size={18} className="text-gray-400" />
                <input 
                  placeholder="Search Messenger" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none ml-2 text-sm w-full font-bold text-gray-700 dark:text-gray-200 placeholder-gray-500" 
                />
              </div>

              {(() => {
                const totalUnreadChats = Object.values(unreadCounts).filter(n => n > 0).length;
                return (
                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
                    <button
                      type="button"
                      onClick={() => { setShowNewFriends(false); setShowStatusUpdates(false); setChatViewMode('active'); }}
                      className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all ${!showStatusUpdates && !showNewFriends && chatViewMode === 'active' ? 'bg-[#1877F2] text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowNewFriends(false); setShowStatusUpdates(!showStatusUpdates); }}
                      className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${showStatusUpdates ? 'bg-[#1877F2] text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${showStatusUpdates ? 'bg-white' : 'bg-[#1877F2]'}`} />
                      Status
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowNewFriends(false); setShowStatusUpdates(false); setChatViewMode(chatViewMode === 'unread' ? 'active' : 'unread'); }}
                      className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${!showStatusUpdates && !showNewFriends && chatViewMode === 'unread' ? 'bg-[#1877F2] text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                    >
                      <span>Unread</span>
                      {totalUnreadChats > 0 && (
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${!showStatusUpdates && !showNewFriends && chatViewMode === 'unread' ? 'bg-white text-[#1877F2]' : 'bg-[#1877F2] text-white'}`}>
                          {totalUnreadChats}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowNewFriends(false); setShowStatusUpdates(false); setChatViewMode(chatViewMode === 'groups' ? 'active' : 'groups'); }}
                      className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all ${!showStatusUpdates && !showNewFriends && chatViewMode === 'groups' ? 'bg-[#1877F2] text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                    >
                      Groups
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowNewFriends(false); setShowStatusUpdates(false); setChatViewMode(chatViewMode === 'archived' ? 'active' : 'archived'); }}
                      className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all ${!showStatusUpdates && !showNewFriends && chatViewMode === 'archived' ? 'bg-[#1877F2] text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                    >
                      Archived
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowStatusUpdates(false); setShowNewFriends(!showNewFriends); }}
                      className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all ${!showStatusUpdates && showNewFriends ? 'bg-[#1877F2] text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                    >
                      New Friends
                    </button>
                  </div>
                );
              })()}
            </>
          )}
        </div>
        {showStatusUpdates ? (
          <StatusRibbon variant="list" />
        ) : (() => {
          const filteredContacts = sortContactsWhatsApp(
            contacts.filter((c: any) => {
              const name = (c.display_name || c.name || '').toLowerCase();
              const uname = (c.username || '').toLowerCase();
              const q = (searchQuery || '').toLowerCase();
              return name.includes(q) || uname.includes(q);
            }),
            unreadCounts,
            pinnedChats
          );
          const visibleList = showNewFriends
            ? filteredContacts.filter((c: any) => c.isNewFriend)
            : filteredContacts.filter((c: any) => {
                if (c.isNewFriend) return false;
                if (chatViewMode === 'unread') return (unreadCounts[c.id] || c.unreadCount || 0) > 0;
                return true;
              });
          return (
        <div id="inbox-list" className="flex-1 overflow-y-auto overscroll-none p-2 space-y-1 min-h-0">
          {loadingContacts && contacts.length === 0 ? (
            <div className="flex flex-col gap-2 px-2 pt-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 w-full animate-pulse">
                  <div className="w-14 h-14 bg-gray-200 dark:bg-gray-800 rounded-full flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-2">
                      <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/2"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/5"></div>
                    </div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-3/4"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : visibleList.map((c: any) => {
            const isOnline = onlineUsers.has(c.id);
            const lastMsg = parseMessagePayload(c.lastMessage);
            const unreadCount = unreadCounts[c.id] || 0;
            const previewText = lastMsg
              ? (lastMsg.is_view_once
                  ? '🔒 View Once message'
                  : lastMsg.media_type === 'video'
                    ? '🎥 Video'
                    : lastMsg.media_type === 'audio'
                      ? '🎤 Voice message'
                      : lastMsg.media_type === 'document'
                        ? `📄 ${lastMsg.filename || 'Document'}`
                        : lastMsg.media_url
                          ? '📷 Photo'
                          : (lastMsg.content || lastMsg.text || ''))
              : '';
            
            return (
              <div 
                key={c.id} 
                onMouseDown={() => startLongPress(c)}
                onMouseUp={cancelLongPress}
                onMouseLeave={cancelLongPress}
                onTouchStart={() => startLongPress(c)}
                onTouchEnd={cancelLongPress}
                onTouchMove={cancelLongPress}
                onClick={() => handleItemClick(c)}
                className={`flex items-center gap-3 p-3 cursor-pointer select-none rounded-2xl transition-all ${
                  (isMultiSelectMode && selectedChatsForAction.some(sc => sc.id === c.id)) 
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-2 border-[#1877F2] shadow-sm' 
                    : selectedChat?.id === c.id 
                      ? 'bg-[#e7f3ff] dark:bg-gray-800 text-[#1877F2] dark:text-blue-400 border-2 border-transparent shadow-sm' 
                      : unreadCount > 0
                        ? 'bg-blue-50/70 dark:bg-blue-950/25 text-gray-900 dark:text-white border-2 border-blue-200 dark:border-blue-900/50 shadow-sm'
                        : 'hover:bg-white dark:hover:bg-gray-900 text-gray-700 dark:text-gray-300 border-2 border-transparent hover:shadow-sm'
                }`}
              >
                <div className="relative flex-shrink-0">
                  <AvatarWithStatusMenu
                    userId={c.id}
                    avatarUrl={c.avatar_url || c.avatar}
                    displayName={c.display_name || c.name}
                    disabled={Boolean(c.is_group)}
                    avatarClassName="w-14 h-14 rounded-full object-cover border-2 border-white dark:border-gray-700 shadow-sm"
                  />
                  {isOnline && <div className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-green-500 border-2 border-white dark:border-black rounded-full pointer-events-none"></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <p className={`truncate flex items-center gap-1 text-[15px] ${unreadCount > 0 ? 'font-black text-gray-950 dark:text-white' : 'font-bold'}`}>
                      {c.display_name || c.name || 'User'}
                      {c.is_verified && <VerifiedBadge size={14} />}
                      {pinnedChats.includes(c.id) && <Pin size={12} className="text-[#1877F2] shrink-0" />}
                    </p>
                    {lastMsg && (
                      <span className={`text-[11px] ml-2 flex-shrink-0 tabular-nums ${unreadCount > 0 ? 'text-[#1877F2] font-bold' : 'text-gray-400 font-medium'}`}>
                        {safeFormatChatTime(lastMsg.created_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <p className={`text-sm truncate ${unreadCount > 0 ? 'font-bold text-gray-900 dark:text-gray-100' : 'font-medium text-gray-500 dark:text-gray-400'}`}>
                      {c.blockStatus ? (
                        <span className="text-red-500 flex items-center gap-1">
                          <Ban size={12} />
                          {c.blockStatus.iBlockedThem ? 'Blocked' : 'Blocked you'}
                        </span>
                      ) : c.isNewFriend ? (
                        <span className="text-blue-500 italic">Say hi to your new friend!</span>
                      ) : lastMsg ? (
                        <>
                          {lastMsg.sender_id === currentUser?.id ? 'You: ' : ''}
                          {previewText}
                        </>
                      ) : (
                        <span className="text-gray-400 italic text-xs">Tap to start chatting</span>
                      )}
                    </p>
                    {unreadCount > 0 && (
                      <span className="min-w-[20px] h-[20px] px-1.5 bg-[#1877F2] text-white text-[11px] font-black rounded-full flex items-center justify-center shrink-0 shadow-sm">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </div>
                  <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${isOnline ? 'text-green-500' : 'text-gray-400'}`}>
                    {isOnline ? 'Active Now' : 'Offline'}
                  </p>
                </div>
              </div>
            );
          })}
          {showNewFriends && visibleList.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-xs font-bold uppercase tracking-widest">No new friends to show</div>
          )}
          {!showNewFriends && visibleList.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-xs font-bold uppercase tracking-widest">
              {chatViewMode === 'unread' ? 'All caught up — no unread messages' : 'No active chats'}
            </div>
          )}
        </div>
          );
        })()}
      </div>

      {/* Message Area */}
      <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-white dark:bg-black relative min-h-0`}>
        {selectedChat ? (
          <>
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shadow-sm bg-white dark:bg-black shrink-0 z-10 min-h-[72px]">
              {selectedMessages.length > 0 ? (
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setSelectedMessages([])} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                      <X size={20} className="text-gray-600 dark:text-gray-300" />
                    </button>
                    <span className="font-bold">{selectedMessages.length} Selected</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedMessages.length === 1 && (
                      <button
                        onClick={() => {
                          const target = messages.find((m: any) => m.id === selectedMessages[0]);
                          if (target) toggleStarMessage(target);
                          setSelectedMessages([]);
                        }}
                        className="p-2 rounded-full text-amber-500 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20"
                        title="Star Message"
                      >
                        <Star size={16} />
                      </button>
                    )}
                    <button onClick={handleDeleteForMe} className="px-3 py-1.5 rounded-full text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 dark:text-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700">
                      Delete for Me
                    </button>
                    {selectedMessages.every(id => messages.find((m: any) => m.id === id)?.sender_id === currentUser?.id) && (
                      <button onClick={handleDeleteForEveryone} className="px-3 py-1.5 rounded-full text-xs font-bold text-white bg-red-500 hover:bg-red-600">
                        Delete for Everyone
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <button onClick={handleBackToSidebar} className="md:hidden p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><ArrowLeft size={20} className="text-gray-600 dark:text-gray-300" /></button>
                    <div className="flex items-center gap-3">
                      <AvatarWithStatusMenu
                        userId={selectedChat.id}
                        avatarUrl={selectedChat.avatar_url}
                        displayName={selectedChat.display_name}
                        disabled={Boolean(selectedChat.is_group)}
                        avatarClassName="w-10 h-10 rounded-full object-cover shadow-sm border border-gray-100 dark:border-gray-700"
                        onNoStatusClick={() => {
                          if (selectedChat.is_group) setShowGroupDetails(true);
                          else navigate(`/profile/${selectedChat.username || selectedChat.id}`);
                        }}
                      />
                      <div
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => {
                          if (selectedChat.is_group) setShowGroupDetails(true);
                          else navigate(`/profile/${selectedChat.username || selectedChat.id}`);
                        }}
                      >
                        <p className="font-bold leading-none text-gray-900 dark:text-white flex items-center gap-1">
                          {selectedChat.display_name}
                          {selectedChat.is_verified && <VerifiedBadge />}
                        </p>
                        <p className={`text-[10px] mt-1 font-black tracking-widest ${liveStatus === 'active' ? 'text-green-500' : liveStatus === 'proposing' ? 'text-yellow-500' : liveStatus === 'failed' ? 'text-red-500' : onlineUsers.has(selectedChat.id) ? 'text-green-500' : 'text-gray-400'}`}>
                          {liveStatus === 'active' ? 'LIVE MODE ACTIVE' : liveStatus === 'proposing' ? 'CONNECTING...' : liveStatus === 'failed' ? 'FAILED (RETRY)' : onlineUsers.has(selectedChat.id) ? 'REALTIME ACTIVE' : 'OFFLINE'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!selectedChat.is_group && (
                      <button 
                        onClick={() => {
                          if (liveStatus === 'active') {
                            sendP2PSignal({ type: 'LIVE_STOP' });
                            try {
                              const receiverChannel = supabase.channel(`user_notifications_${selectedChat.id}`);
                              receiverChannel.send({
                                type: 'broadcast',
                                event: 'LIVE_PROPOSAL_SIGNAL',
                                payload: { type: 'LIVE_STOP', sender_id: currentUser?.id }
                              }).catch(() => {});
                            } catch (_) {}
                            setLiveStatus('inactive');
                            setLiveText('');
                            activeLiveStreamTextRef.current = '';
                          } else if (liveStatus === 'proposing') {
                            cancelLiveProposal();
                          } else if (liveStatus === 'failed') {
                            startLiveProposal();
                          } else if (liveStatus === 'inactive') {
                            startLiveProposal();
                          }
                        }}
                        className={`p-2 rounded-full transition-all flex items-center justify-center relative ${
                          liveStatus === 'active' 
                            ? 'bg-green-500 text-white shadow-lg ring-2 ring-green-300' 
                            : liveStatus === 'proposing' 
                            ? 'bg-yellow-500 text-white shadow-md ring-2 ring-yellow-300' 
                            : liveStatus === 'failed'
                            ? 'bg-red-500 text-white hover:bg-red-600 shadow-md ring-2 ring-red-300 animate-pulse'
                            : 'hover:bg-green-50 dark:hover:bg-green-900/20 text-gray-400 hover:text-green-500'
                        }`} 
                        title={
                          liveStatus === 'active' 
                            ? "Stop Live Typing" 
                            : liveStatus === 'proposing' 
                            ? "Connecting... Click to cancel" 
                            : liveStatus === 'failed'
                            ? "Connection failed. Click to Retry"
                            : "Start Live Typing"
                        }
                      >
                        {liveStatus === 'proposing' ? (
                          <Loader2 size={20} className="animate-spin text-white" />
                        ) : liveStatus === 'failed' ? (
                          <RefreshCw size={20} className="text-white" />
                        ) : (
                          <Zap size={20} />
                        )}
                      </button>
                    )}
                    <button 
                      onClick={handleToggleMute} 
                      className={`p-2 rounded-full transition-all ${isMuted ? 'bg-orange-500 text-white shadow-lg' : 'hover:bg-orange-50 dark:hover:bg-orange-900/20 text-gray-400 hover:text-orange-500'}`} 
                      title={isMuted ? "Unmute Notifications" : "Mute Notifications"}
                    >
                      {isMuted ? <BellOff size={20} /> : <Bell size={20} />}
                    </button>
                    <button 
                      onClick={() => {
                        scrollRef.current?.scrollIntoView({ behavior: 'auto' });
                      }}
                      className="p-2 rounded-full transition-all text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      title="Refresh Chat"
                    >
                      <RefreshCw size={20} />
                    </button>
                    {selectedChat.is_group ? (
                      <button 
                        onClick={async () => {
                          if (window.confirm('Are you sure you want to leave this group?')) {
                            try {
                              const newMembers = (selectedChat.members || []).filter((id: string) => id !== currentUser?.id);
                              const updates: any = { members: newMembers };
                              if (selectedChat.admin_id === currentUser?.id) {
                                updates.admin_id = newMembers.length > 0 ? newMembers[0] : null;
                              }
                              const { error: grpErr } = await supabase
                                .from('profiles')
                                .update(updates)
                                .eq('id', selectedChat.id);
                              if (grpErr) throw grpErr;

                              await dualWriteMessage({
                                id: safeRandomUUID(),
                                chat_id: selectedChat.id,
                                sender_id: currentUser?.id,
                                receiver_id: selectedChat.id,
                                content: 'Left the group',
                                created_at: new Date().toISOString(),
                                is_read: false
                              });
                              setSelectedChat(null);
                              queryClient.invalidateQueries({ queryKey: ['contacts'] });
                              toast.success('Left group');
                            } catch (e) {
                              toast.error('Failed to leave group');
                            }
                          }
                        }} 
                        className="p-2 rounded-full transition-all hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500" 
                        title="Leave Group"
                      >
                        <LogOut size={20} />
                      </button>
                    ) : (
                      <button 
                        onClick={handleBlockUser} 
                        className={`p-2 rounded-full transition-all ${isBlockedByMe ? 'bg-red-500 text-white shadow-lg' : 'hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500'}`} 
                        title={isBlockedByMe ? "Unblock User" : "Block User"}
                      >
                        <Ban size={20} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {liveStatus === 'receiving_proposal' && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-900/50 p-3 px-6 flex items-center justify-between z-10 animate-in slide-in-from-top-2">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-500 text-white p-2 rounded-full shadow-sm animate-pulse">
                    <Zap size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Live Typing Proposal</p>
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{selectedChat.display_name} wants to connect to Live Typing.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => {
                    setLiveStatus('inactive');
                    useGlobalStore.getState().clearPendingLiveProposal(selectedChat.id);
                    const rejectPayload = { type: 'LIVE_PROPOSAL_REJECTED', sender_id: currentUser?.id };
                    sendP2PSignal(rejectPayload);
                    sendSignalToReceiver(selectedChat.id, 'LIVE_PROPOSAL_SIGNAL', rejectPayload);
                  }} className="px-3 py-1.5 rounded-full text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                    Decline
                  </button>
                  <button onClick={() => {
                    setLiveStatus('active');
                    setLiveText('');
                    activeLiveStreamTextRef.current = '';
                    lastInputLengthRef.current = 0;
                    useGlobalStore.getState().clearPendingLiveProposal(selectedChat.id);
                    const acceptPayload = { type: 'LIVE_PROPOSAL_ACCEPTED', sender_id: currentUser?.id };
                    sendP2PSignal(acceptPayload);
                    sendSignalToReceiver(selectedChat.id, 'LIVE_PROPOSAL_SIGNAL', acceptPayload);
                    toast.success('⚡ Live Typing Connected!');
                  }} className="px-3 py-1.5 rounded-full text-xs font-bold bg-blue-500 hover:bg-blue-600 text-white shadow-sm transition-colors">
                    Accept
                  </button>
                </div>
              </div>
            )}

            {liveStatus === 'active' && (
              <div className="bg-green-50 dark:bg-green-900/10 border-b border-green-100 dark:border-green-900/20 p-3 px-6 flex items-start gap-3 z-10">
                <ProfileAvatar userId={selectedChat.id} defaultAvatar={selectedChat.avatar_url} name={selectedChat.display_name} className="w-8 h-8 rounded-full shadow-sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    Live Typing
                  </p>
                  <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed font-medium break-words">
                    {liveText ? (
                      <>
                        {liveText}
                        <span className="ml-1 inline-block w-1.5 h-3.5 bg-green-500 animate-pulse align-middle"></span>
                      </>
                    ) : (
                      <span className="text-xs text-green-700/70 dark:text-green-400/70 italic">
                        Connected — type to stream keystrokes live...
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}
            
            <div id="chat-messages" onScroll={handleScroll} className="flex-1 p-3 md:p-6 overflow-y-auto overscroll-none bg-gray-50/30 dark:bg-gray-900/30 flex flex-col gap-3 min-h-0 transition-all duration-300 select-none" style={{ paddingBottom: '1.5rem' }}>
              {isBlocked ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <div className="bg-red-100 dark:bg-red-900/20 p-6 rounded-full mb-4">
                    <Ban size={48} className="text-red-500" />
                  </div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2">
                    {iBlockedThem ? 'You blocked this user' : 'You are blocked'}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 max-w-xs">
                    {iBlockedThem 
                      ? 'You have blocked this user. You cannot send or receive messages until you unblock them.' 
                      : 'This user has blocked you. You cannot send or receive messages in this conversation.'}
                  </p>
                  {iBlockedThem && (
                    <button 
                      onClick={handleBlockUser}
                      className="mt-6 px-6 py-2 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-all shadow-lg shadow-red-500/25"
                    >
                      Unblock to Chat
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex flex-col items-center my-10 animate-in fade-in zoom-in duration-300 cursor-pointer" onClick={() => navigate(`/profile/${selectedChat.username || selectedChat.id}`)}>
                    <ProfileAvatar userId={selectedChat.id} defaultAvatar={selectedChat.avatar_url} name={selectedChat.display_name} className="w-24 h-24 rounded-full mb-3 shadow-2xl border-4 border-white dark:border-black object-cover hover:scale-105 transition-transform" />
                    <h2 className="text-xl font-black text-gray-900 dark:text-white hover:underline flex items-center gap-2">
                      {selectedChat.display_name}
                      {selectedChat.is_verified && <VerifiedBadge size={20} />}
                    </h2>
                    <p className="text-gray-500 font-bold bg-white dark:bg-black px-3 py-1 rounded-full border border-gray-100 dark:border-gray-800 shadow-sm mt-2 text-xs">@{selectedChat.username}</p>
                  </div>

                  {loadingOlder && (
                    <div className="text-center py-2 text-xs font-semibold text-gray-400">Loading older messages...</div>
                  )}

                  <MemoizedChatMessages
                    messages={messages}
                    visibleLimit={visibleLimit}
                    currentUserId={currentUser?.id}
                    selectedChatId={selectedChat.id}
                    selectedChatDisplayName={selectedChat.display_name}
                    selectedMessages={selectedMessages}
                    reactionsMap={reactionsMap}
                    activeReactionMsgId={activeReactionMsgId}
                    starredIds={starredIdSet}
                    isOnlineOrLive={onlineUsers.has(selectedChat.id) || liveStatus === 'active'}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchMove}
                    onMessageClick={handleMessageClick}
                    onReply={setReplyingTo}
                    onToggleReactionPicker={handleToggleReactionPicker}
                    onToggleReaction={toggleReaction}
                    onToggleStar={toggleStarMessage}
                    onDeleteMessage={triggerDeleteMessage}
                    onViewOnce={handleViewOnce}
                  />
                  {otherUserTyping && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      className="flex justify-start mb-4"
                    >
                      <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-800 flex items-center gap-1">
                         <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                         <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                         <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </motion.div>
                  )}
                  <div ref={scrollRef} />
                </>
              )}
            </div>
            <div className="relative bg-white dark:bg-black border-t border-gray-100 dark:border-gray-800 shrink-0 z-30 select-none">
              {replyingTo && (
                <div className="absolute bottom-full left-0 right-0 bg-white/90 dark:bg-black/90 backdrop-blur border-t border-gray-100 dark:border-gray-800 p-3 px-5 flex items-center justify-between z-20 slide-in-from-bottom-2 animate-in duration-200">
                  <div className="border-l-4 border-[#1877F2] pl-3 flex-1">
                    <p className="text-xs font-bold text-[#1877F2]">Replying to {replyingTo.sender_id === currentUser?.id ? 'Yourself' : selectedChat.display_name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-1">{replyingTo.content || 'Media message'}</p>
                  </div>
                  <button type="button" onClick={() => setReplyingTo(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-500">
                    <X size={20} />
                  </button>
                </div>
              )}

              {showAttachMenu && (
                <div 
                  className="absolute bottom-20 left-4 z-40 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-2.5 shadow-2xl flex flex-col gap-1.5 min-w-[220px] animate-in slide-in-from-bottom-3 duration-200"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowAttachMenu(false);
                      allMediaInputRef.current?.click();
                    }}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/80 text-gray-800 dark:text-gray-200 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 text-[#1877F2] dark:text-blue-400 flex items-center justify-center shrink-0">
                      <ImageIcon size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold">Photos & Videos</p>
                      <p className="text-[10px] text-gray-400">All media types</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowAttachMenu(false);
                      videoInputRef.current?.click();
                    }}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/80 text-gray-800 dark:text-gray-200 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                      <Film size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold">Video Only</p>
                      <p className="text-[10px] text-gray-400">MP4, MOV, WebM</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowAttachMenu(false);
                      setShowCameraCapture(true);
                    }}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/80 text-gray-800 dark:text-gray-200 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <Camera size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold">Camera</p>
                      <p className="text-[10px] text-gray-400">Snap photo or video</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowAttachMenu(false);
                      audioInputRef.current?.click();
                    }}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/80 text-gray-800 dark:text-gray-200 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <Music size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold">Audio & Music</p>
                      <p className="text-[10px] text-gray-400">MP3, WAV, Audio</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowAttachMenu(false);
                      docInputRef.current?.click();
                    }}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/80 text-gray-800 dark:text-gray-200 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <FileText size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold">Document / File</p>
                      <p className="text-[10px] text-gray-400">PDF, ZIP, any file</p>
                    </div>
                  </button>
                </div>
              )}

              <form onSubmit={handleSendMessage} className="p-3 md:p-5 flex items-center gap-2 md:gap-3 relative z-30 shrink-0">
                {!recordedAudio && (
                  <>
                    <input type="file" ref={fileInputRef} hidden onChange={handleFileSelect} accept="*/*" />
                    <input type="file" ref={allMediaInputRef} hidden onChange={handleFileSelect} accept="image/*,video/*" />
                    <input type="file" ref={videoInputRef} hidden onChange={handleFileSelect} accept="video/*" />
                    <input type="file" ref={imageInputRef} hidden onChange={handleFileSelect} accept="image/*" />
                    <input type="file" ref={audioInputRef} hidden onChange={handleFileSelect} accept="audio/*" />
                    <input type="file" ref={docInputRef} hidden onChange={handleFileSelect} accept="*/*" />
                  </>
                )}
                
                {!recordedAudio && (
                  <button 
                    type="button" 
                    disabled={isBlocked || isRecording} 
                    onClick={() => setShowAttachMenu(!showAttachMenu)}
                    className={`p-2 md:p-2.5 rounded-full transition-all disabled:opacity-50 shrink-0 ${
                      showAttachMenu 
                        ? 'bg-blue-100 dark:bg-blue-900/40 text-[#1877F2]' 
                        : 'text-[#1877F2] hover:bg-blue-50 dark:hover:bg-blue-900/20'
                    }`}
                    title="Attach Media or File"
                  >
                    <Paperclip size={22} />
                  </button>
                )}

                {recordedAudio ? (
                  <div className="flex-1 bg-blue-50 dark:bg-blue-900/10 rounded-2xl flex items-center pl-1 pr-4 py-1.5 border border-blue-200 dark:border-blue-800/50 justify-between gap-3">
                    <CustomAudioPlayer src={recordedAudio.url} isSender={false} />
                  </div>
                ) : isRecording ? (
                  <div className="flex-1 bg-red-50 dark:bg-red-900/10 rounded-2xl flex items-center px-4 py-2.5 border border-red-200 dark:border-red-800/50 justify-between">
                    <div className="flex items-center gap-2 text-red-500 animate-pulse">
                      <Mic size={20} />
                      <span className="font-bold">Recording...</span>
                    </div>
                    <span className="text-red-500 font-mono font-bold">
                      {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                ) : (
                  <div className={`flex-1 bg-[#f0f2f5] dark:bg-gray-900 rounded-2xl flex items-center px-4 py-2.5 border transition-all relative ${isTextViewOnce ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-transparent focus-within:border-blue-300'}`}>
                    <input 
                      ref={inputRef}
                      value={messageText} 
                      onChange={e => handleMessageTextChange(e.target.value)} 
                      onFocus={() => {
                        setIsInputFocused(true);
                        setTimeout(() => {
                          scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                        }, 300);
                      }}
                      onBlur={() => setIsInputFocused(false)}
                      placeholder={isBlocked ? "You cannot message this user." : (isTextViewOnce ? "Type a View Once message..." : "Type a message...")}
                      disabled={isBlocked}
                      className="bg-transparent border-none outline-none text-[15px] w-full font-bold text-gray-800 dark:text-white placeholder-gray-500 disabled:cursor-not-allowed" 
                    />
                    
                    <div className="flex items-center gap-1.5 shrink-0 ml-1">
                      {messageText.trim().length > 0 && (
                        <button 
                          type="button" 
                          disabled={isBlocked}
                          title={isTextViewOnce ? "View Once active (Tap to disable)" : "Send as View Once message"}
                          onClick={() => {
                            setIsTextViewOnce(!isTextViewOnce);
                            if (!isTextViewOnce) {
                              toast.success("View Once mode activated for this message", { duration: 1500 });
                            }
                          }}
                          className={`p-1.5 rounded-full transition-all flex items-center justify-center shrink-0 ${
                            isTextViewOnce 
                              ? 'bg-[#1877F2] text-white shadow-md scale-105 ring-2 ring-blue-300 dark:ring-blue-800' 
                              : 'text-gray-400 hover:text-[#1877F2] hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center font-black text-[11px] ${isTextViewOnce ? 'border-white text-white' : 'border-current text-current'}`}>
                            1
                          </div>
                        </button>
                      )}

                      <button 
                        type="button" 
                        disabled={isBlocked} 
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className={`transition-all ${showEmojiPicker ? 'text-orange-500 scale-110' : 'text-[#1877F2]'} disabled:opacity-50`}
                      >
                        <Smile size={22} />
                      </button>
                    </div>

                    {showEmojiPicker && (
                      <div className="absolute bottom-full right-0 mb-2 z-50 shadow-2xl animate-in slide-in-from-bottom-2 duration-200">
                        <div className="fixed inset-0" onClick={() => setShowEmojiPicker(false)}></div>
                        <div className="relative">
                          <Suspense fallback={<div className="w-[300px] h-[400px] bg-white dark:bg-gray-900 rounded-xl flex items-center justify-center"><Loader2 className="animate-spin text-[#1877F2]" /></div>}>
                            <EmojiPicker 
                              onEmojiClick={handleEmojiClick}
                              autoFocusSearch={false}
                              theme={'auto' as any}
                              width={300}
                              height={400}
                            />
                          </Suspense>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                {recordedAudio ? (
                  <button type="button" onClick={handleSendAudio} disabled={isBlocked} className="bg-[#1877F2] text-white p-2 md:p-2.5 rounded-full shadow-md hover:brightness-110 disabled:opacity-30 transition-all shrink-0">
                    <Send size={24} />
                  </button>
                ) : messageText.trim() ? (
                  <button 
                    type="submit" 
                    disabled={isBlocked} 
                    className="bg-[#1877F2] text-white p-2 md:p-2.5 rounded-full shadow-md hover:brightness-110 disabled:opacity-30 transition-all shrink-0 relative"
                  >
                    <Send size={24} />
                    {isTextViewOnce && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-black flex items-center justify-center shadow-sm">
                        1
                      </span>
                    )}
                  </button>
                ) : (
                  <button 
                    type="button" 
                    disabled={isBlocked} 
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`p-2.5 rounded-full shadow-md transition-all shrink-0 select-none ${isRecording ? 'bg-red-500 text-white hover:brightness-110 scale-110 animate-pulse' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-[#1877F2] dark:hover:text-blue-400 disabled:opacity-30'}`}
                  >
                    {isRecording ? <div className="w-6 h-6 rounded-sm bg-white" /> : <Mic size={24} />}
                  </button>
                )}
              </form>

            </div>
            
            {activeViewOnceMedia && (
              <div 
                className="fixed inset-0 z-[999] bg-black/98 flex flex-col items-center justify-between p-4 md:p-8 cursor-pointer select-none"
                onContextMenu={(e) => e.preventDefault()}
                onClick={handleCloseViewOnce}
              >
                {/* Navbar for full-screen view */}
                <div 
                  className="w-full max-w-3xl h-16 bg-white/5 backdrop-blur-md px-6 rounded-2xl flex items-center justify-between z-50 border border-white/10 cursor-default shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button 
                    onClick={handleCloseViewOnce}
                    className="flex items-center gap-2 text-white hover:text-blue-400 transition-colors bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full font-bold text-sm"
                  >
                    <ArrowLeft size={18} />
                    <span>Back</span>
                  </button>
                  <div className="bg-black/60 border border-white/10 px-4 py-1.5 rounded-full text-white text-xs font-bold flex items-center gap-2 backdrop-blur-md select-none pointer-events-none">
                    <div className="w-4 h-4 rounded-full border border-red-500 text-red-500 flex items-center justify-center font-black text-[9px] animate-pulse">1</div>
                    <span>View Once Mode</span>
                  </div>
                  <button 
                    onClick={handleCloseViewOnce}
                    className="p-2 bg-white/10 hover:bg-red-500 rounded-full text-white transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Secret Message Content Area */}
                <div 
                  className="max-w-2xl w-full flex-1 flex flex-col items-center justify-center my-6 cursor-default"
                  onClick={(e) => e.stopPropagation()}
                >
                   {activeViewOnceMedia.media_url ? (
                     activeViewOnceMedia.media_type === 'image' ? (
                       <img src={activeViewOnceMedia.media_url} className="max-w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl" />
                     ) : activeViewOnceMedia.media_type === 'audio' ? (
                       <div className="bg-white/10 border border-white/10 p-8 rounded-3xl w-full max-w-md shadow-2xl">
                          <CustomAudioPlayer src={activeViewOnceMedia.media_url} isSender={false} />
                       </div>
                     ) : (
                       <VideoPlayer src={activeViewOnceMedia.media_url} className="max-w-full max-h-[70vh] rounded-2xl shadow-2xl" />
                     )
                   ) : (
                     <div className="bg-gray-900/90 border border-gray-800 p-8 md:p-12 rounded-3xl w-full shadow-2xl flex flex-col items-center gap-6 text-center animate-in zoom-in-95 duration-200">
                       <div className="w-16 h-16 rounded-full border-2 border-blue-500/80 bg-blue-500/10 text-blue-400 flex items-center justify-center font-black text-2xl shadow-inner">
                         1
                       </div>
                       <p className="text-xl md:text-3xl text-white font-semibold leading-relaxed break-words max-h-[50vh] overflow-y-auto px-2">
                         {activeViewOnceMedia.content}
                       </p>
                       <span className="text-xs text-gray-400 font-medium tracking-wide uppercase">
                         Secret One-Time Message
                       </span>
                     </div>
                   )}
                </div>
                
                {/* Footer and Dismiss Actions */}
                <div 
                  className="flex flex-col items-center gap-3 cursor-default"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-gray-400 font-bold text-xs bg-white/5 px-4 py-2 rounded-full backdrop-blur-sm select-none border border-white/5">
                    This message will permanently disappear when you exit this screen.
                  </p>
                  <button 
                    onClick={handleCloseViewOnce}
                    className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white rounded-full font-bold text-sm flex items-center gap-2 shadow-xl hover:scale-105 transition-all"
                  >
                    <ArrowLeft size={16} />
                    <span>Back to Chat</span>
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-200 dark:text-gray-800 bg-gray-50/10 dark:bg-gray-900/10">
            <div className="bg-white dark:bg-gray-900 p-12 rounded-full shadow-2xl mb-8">
               <MessageSquare size={100} strokeWidth={1} className="text-blue-50 dark:text-blue-900/20" />
            </div>
            <p className="text-2xl font-black text-gray-900 dark:text-white">Next</p>
            <p className="mt-2 font-bold text-gray-400">Select a contact to start an instant conversation.</p>
          </div>
        )}
        {showMediaEditor && selectedMedia && (
          <Suspense fallback={null}>
            <MediaEditor 
              mediaUrl={selectedMedia.url} 
              mediaType={selectedMedia.type === 'video' ? 'video' : 'image'} 
              onSave={handleMediaSave} 
              onCancel={() => { setShowMediaEditor(false); setSelectedMedia(null); }} 
            />
          </Suspense>
        )}

        {showMediaPreviewModal && selectedMedia && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-xl bg-white dark:bg-gray-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border border-gray-100 dark:border-gray-800 animate-in zoom-in-95 duration-200">
              
              {/* Header */}
              <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#1877F2] animate-pulse" />
                  <h3 className="font-black text-sm text-gray-900 dark:text-white capitalize">
                    Send {selectedMedia.type}
                  </h3>
                  <span className="text-xs text-gray-400 truncate max-w-[200px]">({selectedMedia.name})</span>
                </div>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowMediaPreviewModal(false);
                    setSelectedMedia(null);
                  }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Preview Body */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center min-h-[260px] max-h-[55vh] bg-black/5 dark:bg-black/40">
                {selectedMedia.type === 'video' ? (
                  <video 
                    src={selectedMedia.url} 
                    controls 
                    playsInline 
                    className="max-h-[50vh] max-w-full rounded-2xl shadow-lg bg-black object-contain"
                  />
                ) : selectedMedia.type === 'image' ? (
                  <div className="relative group flex flex-col items-center">
                    <img 
                      src={selectedMedia.url} 
                      className="max-h-[50vh] max-w-full rounded-2xl object-contain shadow-lg" 
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowMediaPreviewModal(false);
                        setShowMediaEditor(true);
                      }}
                      className="mt-3 px-4 py-1.5 bg-[#1877F2] hover:bg-blue-600 text-white rounded-full font-bold text-xs flex items-center gap-1.5 shadow-md transition-all"
                    >
                      <SlidersHorizontal size={14} />
                      <span>Edit / Filter / Draw</span>
                    </button>
                  </div>
                ) : selectedMedia.type === 'audio' ? (
                  <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-md flex flex-col items-center gap-4 w-full max-w-md border border-gray-100 dark:border-gray-700">
                    <div className="w-14 h-14 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
                      <Music size={28} />
                    </div>
                    <div className="text-center w-full">
                      <p className="font-bold text-sm text-gray-900 dark:text-white truncate">{selectedMedia.name}</p>
                      <p className="text-xs text-gray-400 mt-1">{(selectedMedia.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                    <audio src={selectedMedia.url} controls className="w-full" />
                  </div>
                ) : (
                  <div className="p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-md flex flex-col items-center gap-3 w-full max-w-md border border-gray-100 dark:border-gray-700">
                    <div className="w-16 h-16 rounded-2xl bg-blue-500/10 text-[#1877F2] flex items-center justify-center">
                      <FileText size={32} />
                    </div>
                    <div className="text-center w-full">
                      <p className="font-bold text-sm text-gray-900 dark:text-white truncate">{selectedMedia.name}</p>
                      <p className="text-xs text-gray-400 mt-1">{(selectedMedia.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Caption & Controls */}
              <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <input 
                    type="text" 
                    value={mediaCaption}
                    onChange={(e) => setMediaCaption(e.target.value)}
                    placeholder="Add a caption or message..."
                    className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-800 dark:text-white placeholder-gray-400 border border-gray-200 dark:border-gray-700 focus:outline-none focus:border-blue-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSendMediaPreview();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setIsMediaViewOnce(!isMediaViewOnce)}
                    className={`px-3 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all border shrink-0 ${
                      isMediaViewOnce 
                        ? 'bg-[#1877F2] text-white border-[#1877F2] shadow-md' 
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100'
                    }`}
                    title="View Once message"
                  >
                    <div className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px] font-black">1</div>
                    <span>1x View</span>
                  </button>
                </div>

                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMediaPreviewModal(false);
                      setSelectedMedia(null);
                    }}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSendMediaPreview}
                    className="px-6 py-2.5 bg-[#1877F2] hover:bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-500/25 active:scale-95 transition-all"
                  >
                    <Send size={14} />
                    <span>Send {selectedMedia.type === 'video' ? 'Video' : selectedMedia.type === 'audio' ? 'Audio' : selectedMedia.type === 'image' ? 'Photo' : 'File'}</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {showCameraCapture && (
          <Suspense fallback={null}>
            <CameraCapture 
              onCapture={(dataUrl, type) => {
                setShowCameraCapture(false);
                fetch(dataUrl)
                  .then(r => r.blob())
                  .then(blob => {
                    const ext = type === 'video' ? 'webm' : 'jpg';
                    const file = new File([blob], `camera_${Date.now()}.${ext}`, {
                      type: blob.type || (type === 'video' ? 'video/webm' : 'image/jpeg')
                    });
                    processIncomingFile(file);
                  });
              }} 
              onCancel={() => setShowCameraCapture(false)} 
            />
          </Suspense>
        )}
      </div>

      
      {/* Report Modal */}
      {showReportConfirm && selectedChatsForAction.length === 1 && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1a1a1b] rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Report User</h3>
            <p className="text-sm text-gray-500 mb-4">Please specify the reason for reporting this user.</p>
            <textarea
              className="w-full p-3 rounded-xl bg-gray-50 dark:bg-black border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white mb-4 outline-none resize-none h-24"
              placeholder="Reason for report..."
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
            ></textarea>
            <div className="flex gap-3">
              <button 
                className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold"
                onClick={() => { setShowReportConfirm(false); setIsMultiSelectMode(false); setSelectedChatsForAction([]); setReportReason(''); }}
              >
                Cancel
              </button>
              <button 
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold"
                onClick={async () => {
                  if (!reportReason.trim()) return toast.error('Please provide a reason');
                  try {
                    await addDoc(collection(db, 'reports'), {
                      reporter_id: currentUser?.id,
                      reported_entity_id: selectedChatsForAction[0].id,
                      entity_type: 'user',
                      reason: reportReason,
                      created_at: new Date().toISOString()
                    });
                    toast.success('Report submitted successfully');
                    setShowReportConfirm(false);
                    setIsMultiSelectMode(false);
                    setSelectedChatsForAction([]);
                    setReportReason('');
                  } catch (e) {
                    toast.error('Failed to submit report');
                  }
                }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Group Create Modal */}
      {showGroupCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1a1a1b] rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Create Group</h3>
            
            <div className="flex flex-col items-center mb-4">
              <label className="relative cursor-pointer mb-2 block w-24 h-24 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-500 transition-colors">
                {groupAvatarPreview ? (
                  <img src={groupAvatarPreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                    <Users size={32} />
                  </div>
                )}
                <input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  const inputEl = e.target;
                  if (file) {
                    const isSafe = await scanFile(file, inputEl);
                    if (!isSafe) return;
                    setGroupAvatarFile(file);
                    setGroupAvatarPreview(URL.createObjectURL(file));
                  }
                }} />
              </label>
              <span className="text-xs text-gray-500">Upload Group Photo</span>
            </div>

            <input
              type="text"
              className="w-full p-3 rounded-xl bg-gray-50 dark:bg-black border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white mb-4 outline-none focus:border-blue-500"
              placeholder="Group Name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            <p className="text-xs text-gray-500 mb-4 text-center">{selectedChatsForAction.length} members selected.</p>
            <div className="flex gap-3">
              <button 
                className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold"
                onClick={() => { setShowGroupCreate(false); setIsMultiSelectMode(false); setSelectedChatsForAction([]); setGroupName(''); setGroupAvatarFile(null); setGroupAvatarPreview(''); }}
              >
                Cancel
              </button>
              <button 
                className="flex-1 py-2.5 rounded-xl bg-[#1877F2] hover:bg-[#166fe5] text-white font-bold"
                onClick={async () => {
                  if (!groupName.trim()) return toast.error('Group name required');
                  try {
                    const groupId = 'group_' + Date.now();
                    const memberIds = Array.from(new Set([currentUser?.id, ...selectedChatsForAction.map(c => c.id)].filter(Boolean)));
                    const nowIso = new Date().toISOString();

                    const { error: createErr } = await supabase.from('profiles').insert({
                      id: groupId,
                      username: groupId,
                      is_group: true,
                      display_name: groupName.trim(),
                      admin_id: currentUser?.id,
                      members: memberIds,
                      created_at: nowIso,
                      updated_at: nowIso
                    });
                    if (createErr) throw createErr;

                    if (groupAvatarFile) {
                      addUpload(groupAvatarFile, 'profile', { userId: groupId });
                    }

                    // Insert Welcome Message so it shows in inbox
                    await dualWriteMessage({
                      id: safeRandomUUID(),
                      chat_id: groupId,
                      sender_id: currentUser?.id,
                      receiver_id: groupId,
                      content: 'Group created',
                      created_at: nowIso,
                      is_read: false
                    });

                    toast.success('Group created!');
                    setShowGroupCreate(false);
                    setIsMultiSelectMode(false);
                    setSelectedChatsForAction([]);
                    setGroupName('');
                    setGroupAvatarFile(null);
                    setGroupAvatarPreview('');

                    queryClient.invalidateQueries({ queryKey: ['contacts'] });
                  } catch (e: any) {
                    toast.error('Failed to create group: ' + (e?.message || ''));
                  }
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Details Modal */}
      {showGroupDetails && selectedChat?.is_group && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1a1a1b] rounded-2xl w-full max-w-sm shadow-xl max-h-[85vh] flex flex-col relative overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-[#1a1a1b] shrink-0">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Group Info</h3>
              <button onClick={() => setShowGroupDetails(false)} className="p-2 bg-gray-200 dark:bg-gray-800 rounded-full hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <div className="flex flex-col items-center mb-6">
                <label className="relative cursor-pointer mb-3 block w-24 h-24 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:opacity-80 transition-opacity">
                  <ProfileAvatar userId={selectedChat.id} defaultAvatar={selectedChat.avatar_url} name={selectedChat.display_name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity text-white text-xs font-bold">Change</div>
                  <input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    const inputEl = e.target;
                    if (file) {
                      const isSafe = await scanFile(file, inputEl);
                      if (!isSafe) return;
                      addUpload(file, 'profile', { userId: selectedChat.id, onSuccess: () => {
                         toast.success('Group photo updated');
                         queryClient.invalidateQueries({ queryKey: ['contacts'] });
                      }});
                    }
                  }} />
                </label>
                <div className="flex items-center gap-2">
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white">{selectedChat.display_name}</h4>
                </div>
              </div>

              <div className="mb-2 flex justify-between items-center">
                <h5 className="font-bold text-gray-700 dark:text-gray-300">Members ({groupMembers.length})</h5>
                {selectedChat.admin_id === currentUser?.id && (
                  <button onClick={() => setShowAddMembers(true)} className="text-xs font-bold text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/40">
                    + Add
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {groupMembers.map(member => (
                  <div key={member.id} className="flex items-center justify-between bg-gray-50 dark:bg-black p-2 rounded-xl">
                    <div className="flex items-center gap-3">
                      <ProfileAvatar userId={member.id} defaultAvatar={member.avatar_url || member.avatar} name={member.display_name || member.name} className="w-10 h-10 rounded-full" />
                      <div>
                        <p className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1">
                          {member.display_name || member.name}
                          {selectedChat.admin_id === member.id && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-black ml-1">ADMIN</span>}
                        </p>
                      </div>
                    </div>
                    {selectedChat.admin_id === currentUser?.id && member.id !== currentUser?.id && (
                      <button 
                        onClick={async () => {
                           if (window.confirm(`Remove ${member.display_name} from group?`)) {
                              const newMembers = (selectedChat.members || []).filter((id: string) => id !== member.id);
                              await supabase.from('profiles').update({ members: newMembers }).eq('id', selectedChat.id);
                              setGroupMembers(prev => prev.filter(m => m.id !== member.id));
                              toast.success('Member removed');
                              setSelectedChat({ ...selectedChat, members: newMembers });
                           }
                        }}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Members Modal */}
      {showAddMembers && selectedChat?.is_group && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
           <div className="bg-white dark:bg-[#1a1a1b] rounded-2xl w-full max-w-sm p-6 shadow-xl max-h-[80vh] flex flex-col relative overflow-hidden">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Add Members</h3>
              <div className="flex-1 overflow-y-auto mb-4 space-y-2">
                 {contacts.filter((c: any) => !c.is_group && !selectedChat.members.includes(c.id)).map((friend: any) => (
                    <div key={friend.id} className="flex items-center justify-between bg-gray-50 dark:bg-black p-2 rounded-xl">
                       <div className="flex items-center gap-3">
                         <ProfileAvatar userId={friend.id} defaultAvatar={friend.avatar_url || friend.avatar} name={friend.display_name || friend.name} className="w-10 h-10 rounded-full" />
                         <span className="font-bold text-sm text-gray-900 dark:text-white">{friend.display_name || friend.name}</span>
                       </div>
                       <button 
                         onClick={async () => {
                            const newMembers = [...(selectedChat.members || []), friend.id];
                            await supabase.from('profiles').update({ members: newMembers }).eq('id', selectedChat.id);
                            setGroupMembers(prev => [...prev, friend]);
                            setShowAddMembers(false);
                            toast.success('Member added');
                            setSelectedChat({ ...selectedChat, members: newMembers });
                         }}
                         className="px-3 py-1 text-xs font-bold bg-blue-500 text-white rounded-full hover:bg-blue-600"
                       >
                         Add
                       </button>
                    </div>
                 ))}
                 {contacts.filter((c: any) => !c.is_group && !selectedChat.members.includes(c.id)).length === 0 && (
                    <p className="text-center text-sm text-gray-500 my-4">No new friends to add</p>
                 )}
              </div>
              <button onClick={() => setShowAddMembers(false)} className="w-full py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold">
                Close
              </button>
           </div>
        </div>
      )}
      <ConfirmDialog
        isOpen={!!deleteConfirmId}
        title="Delete Message"
        message={
          deleteConfirmId && messages.find((m: any) => m.id === deleteConfirmId)?.sender_id === currentUser?.id
            ? "Are you sure you want to delete this message for everyone?"
            : "Are you sure you want to delete this message for yourself?"
        }
        onConfirm={executeDeleteMessage}
        onCancel={() => setDeleteConfirmId(null)}
      />

      {showStarredModal && (
        <div
          onClick={() => setShowStarredModal(false)}
          className="fixed inset-0 bg-black/60 z-[75] flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#1a1a1b] rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[80vh] flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Star size={18} className="fill-amber-400 text-amber-500" />
                Starred Messages
              </h3>
              <button
                type="button"
                aria-label="Close starred messages"
                onClick={() => setShowStarredModal(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2.5">
              {starredItems.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-8">No starred messages yet.</p>
              ) : starredItems.map((item: any) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setShowStarredModal(false);
                    if (item.chatId) openChatWithUserId(item.chatId);
                  }}
                  className="p-3 rounded-xl bg-gray-50 dark:bg-black border border-gray-100 dark:border-gray-800 cursor-pointer hover:border-blue-400 transition-colors"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-[#1877F2]">{item.chatName}</span>
                    <span className="text-[10px] text-gray-400">{formatTime(item.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2">{item.preview}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Chat"
        message={`Are you sure you want to delete all chat history with ${chatToDelete?.display_name}? This will hide and delete the chat history only on your phone.`}
        onConfirm={() => {
          if (chatToDelete) {
            handleDeleteChat(chatToDelete.id);
          }
          setShowDeleteConfirm(false);
          setChatToDelete(null);
        }}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setChatToDelete(null);
        }}
      />
    </div>
  );
};

export default Messages;
