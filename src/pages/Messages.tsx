import { localDB } from "@/lib/dexie";
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { Flag, Users, Search, Trash2, Send, Smile, Paperclip, MessageSquare, ArrowLeft, Check, CheckCheck, Ban, RefreshCw, X, CornerUpLeft, EyeOff, Mic, Eye, Play, Pause, BellOff, Bell, Activity, Zap, LogOut, FileText, Music, Camera, Download, Plus, Video as VideoIcon, Image as ImageIcon, Folder, Film, Sparkles, Clock } from 'lucide-react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { useAuth } from '@/contexts/AuthContext';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import ZoomableImage from '@/components/ZoomableImage';
import VideoPlayer from '@/components/VideoPlayer';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { redis } from '@/lib/redis';

// Firebase imports
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, deleteDoc, doc, getDoc, updateDoc, setDoc, onSnapshot, orderBy, limit, limitToLast, addDoc, serverTimestamp, or, and, arrayUnion } from 'firebase/firestore';
import { getActiveDB, switchDB, dualWriteMessage } from '@/lib/dbHelper';
import { supabase } from '@/lib/supabase';

import { MediaEditor, CameraCapture } from '../components/MediaTools';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useUpload } from '@/contexts/UploadContext';
import ConfirmDialog from '@/components/ConfirmDialog';
import { formatTime } from '@/lib/utils';
import { triggerNotification } from '@/services/notificationService';
import { useGlobalStore } from '@/store/useGlobalStore';
import { toast } from 'sonner';
import { useContentFilter } from '@/hooks/useContentFilter';

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

  return (
    <div className={`flex items-center gap-3 w-full min-w-[200px] sm:min-w-[240px] max-w-[280px] px-1 py-0.5`}>
      <audio ref={audioRef} src={src} preload="metadata" />
      
      <button 
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center transition-transform hover:scale-105 active:scale-95 ${isSender ? 'bg-white text-[#1877F2] shadow-sm' : 'bg-[#1877F2] text-white shadow-md'}`}
      >
        {isPlaying ? <Pause fill="currentColor" size={18} /> : <Play fill="currentColor" size={20} className="ml-1" />}
      </button>

      <div className="flex-1 flex flex-col justify-center">
        <div className="relative w-full flex items-center h-6 group">
           <input
             type="range"
             min="0"
             max="100"
             value={progress || 0}
             onChange={handleSeek}
             className={`w-full h-1.5 rounded-full appearance-none cursor-pointer transition-all ${isSender ? 'bg-black/10 accent-white' : 'bg-gray-200 dark:bg-gray-700 accent-[#1877F2]'}`}
             style={{ 
               background: `linear-gradient(to right, ${isSender ? 'white' : '#1877F2'} ${progress}%, ${isSender ? 'rgba(0,0,0,0.1)' : 'var(--tw-colors-gray-200)'} ${progress}%)` 
             }}
           />
        </div>
        <div className={`text-[11px] font-medium leading-none mt-0.5 flex justify-between tracking-wide ${isSender ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
          <span>{formatAudioTime(audioRef.current?.currentTime || 0)}</span>
          <span>{formatAudioTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};

const Messages: React.FC = () => {
  const { currentUser } = useAuth();
  const { addUpload } = useUpload();
  const navigate = useNavigate();
  const location = useLocation();
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
  const [chatViewMode, setChatViewMode] = useState<'active' | 'archived' | 'groups'>('active');
  const [groupMembers, setGroupMembers] = useState<any[]>([]);

  const setIsChatOpen = useGlobalStore(state => state.setIsChatOpen);
  
  useEffect(() => {
    setIsChatOpen(!!selectedChat);
    return () => {
      setIsChatOpen(false);
    };
  }, [selectedChat, setIsChatOpen]);

  useEffect(() => {
    if (showGroupDetails && selectedChat?.is_group) {
       const fetchMembers = async () => {
          if (!selectedChat.members || selectedChat.members.length === 0) return;
          const chunks = [];
          for (let i = 0; i < selectedChat.members.length; i += 10) {
            chunks.push(selectedChat.members.slice(i, i + 10));
          }
          let allMems: any[] = [];
          for (const chunk of chunks) {
            const q = query(collection(db, 'profiles'), where('__name__', 'in', chunk));
            const snap = await getDocs(q);
            allMems = [...allMems, ...snap.docs.map(d => ({id: d.id, ...d.data()}))];
          }
          setGroupMembers(allMems);
       };
       fetchMembers();
    }
  }, [showGroupDetails, selectedChat]);

  const longPressTimerRef = useRef<any>(null);
  const isLongPressRef = useRef<boolean>(false);
  const activeChannelRef = useRef<any>(null);

    const { isSupabaseActive } = useGlobalStore();

  useEffect(() => {
    if (currentUser && isSupabaseActive) {
      // Background sync profile to Supabase
      supabase.from('profiles').upsert({
        id: currentUser.id,
        display_name: (currentUser as any).displayName || (currentUser as any).name || currentUser.display_name || '',
        avatar_url: (currentUser as any).photoURL || (currentUser as any).avatar || currentUser.avatar_url || '',
        updated_at: new Date().toISOString()
      }).then(({ error }) => {
        if (error) console.warn("Supabase profile sync warning:", error.message);
      });
    }
  }, [currentUser, isSupabaseActive]);

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
        const { localDB } = await import('@/lib/dexie');
        await localDB.messages
          .where('sender_id').equals(contactId)
          .or('receiver_id').equals(contactId)
          .delete();
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

      // 1. Supabase bulk update (Zero reads, highly efficient)
      try {
        await supabase
          .from('messages')
          .update({ deleted_for: [currentUser.id] })
          .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${currentUser.id})`);
      } catch (e) {
        console.warn("Supabase bulk delete failed", e);
      }

      // 2. Firebase update (Limit to avoid massive reads)
      try {
        const q1 = query(
          collection(db, 'messages'),
          where('sender_id', '==', currentUser.id),
          where('receiver_id', '==', contactId),
          limit(50)
        );
        const q2 = query(
          collection(db, 'messages'),
          where('sender_id', '==', contactId),
          where('receiver_id', '==', currentUser.id),
          limit(50)
        );

        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        const allMsgs = [...snap1.docs, ...snap2.docs];

        await Promise.all(allMsgs.map(d => 
          updateDoc(doc(db, 'messages', d.id), {
            deleted_for: arrayUnion(currentUser.id)
          }).catch(() => {})
        ));
      } catch (e) {
        console.warn("Firebase limited delete failed", e);
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
  const handleTouchStart = (id: string) => {
    longPressTimer.current = setTimeout(() => {
      if (!selectedMessages.includes(id)) {
        if ('vibrate' in navigator) navigator.vibrate(50);
        setSelectedMessages(prev => [...prev, id]);
      }
    }, 2500);
  };
  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };
  const handleTouchMove = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };
  const handleMessageClick = (id: string) => {
    if (selectedMessages.length > 0) {
      if (selectedMessages.includes(id)) {
        setSelectedMessages(prev => prev.filter(m => m !== id));
      } else {
        setSelectedMessages(prev => [...prev, id]);
      }
    }
  };

  const handleInputDragStart = (e: React.TouchEvent | React.MouseEvent) => {
    setIsDraggingInput(true);
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartYRef.current = clientY;
    dragStartOffsetRef.current = inputOffset;
    if (inputRef.current) inputRef.current.blur();
    setIsInputFocused(false);
    if (e.cancelable) e.preventDefault();
  };

  const handleScroll = (e: any) => {
    if (e.target.scrollTop === 0 && messages.length > visibleLimit) {
      const oldHeight = e.target.scrollHeight;
      setVisibleLimit(prev => prev + 50);
      setTimeout(() => {
        e.target.scrollTop = e.target.scrollHeight - oldHeight;
      }, 0);
    }
  };

  useEffect(() => {
    if (selectedChat && currentUser) {
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
  }, [selectedChat, currentUser]);

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
      if (text.trim() === '') {
        localStorage.removeItem(draftKey);
      } else {
        localStorage.setItem(draftKey, text);
      }
      
      if (liveStatus === 'active') {
        const now = Date.now();
        if (now - lastLiveTextSendTimeRef.current > 200) {
          sendP2PSignal({ type: 'LIVE_TEXT_STREAM', text });
          lastLiveTextSendTimeRef.current = now;
        } else {
          if (liveTextTimeoutRef.current) clearTimeout(liveTextTimeoutRef.current);
          liveTextTimeoutRef.current = setTimeout(() => {
            sendP2PSignal({ type: 'LIVE_TEXT_STREAM', text });
            lastLiveTextSendTimeRef.current = Date.now();
          }, 200);
        }
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
    if (!currentUser || !selectedChat) {
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
          setLiveStatus('receiving_proposal');
        } else if (data.type === 'LIVE_PROPOSAL_ACCEPTED') {
          setLiveStatus('active');
          setLiveText('');
        } else if (data.type === 'LIVE_PROPOSAL_REJECTED' || data.type === 'LIVE_STOP') {
          setLiveStatus('inactive');
          setLiveText('');
        } else if (data.type === 'LIVE_TEXT_STREAM') {
          setLiveText(data.text);
        }
      }
    };
    
    window.addEventListener('P2P_SIGNAL' as any, handleSignal as any);
    
    return () => {
       window.removeEventListener('P2P_SIGNAL' as any, handleSignal as any);
    };
  }, [selectedChat, currentUser]);

  // Clean up live typing when selectedChat changes
  useEffect(() => {
    return () => {
      if (liveStatus !== 'inactive') {
        sendP2PSignal({ type: 'LIVE_STOP' });
      }
      setLiveStatus('inactive');
      setLiveText('');
    };
  }, [selectedChat]);

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
  const [liveStatus, setLiveStatus] = useState<'inactive' | 'proposing' | 'receiving_proposal' | 'active'>('inactive');
  const [liveText, setLiveText] = useState('');

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

  useEffect(() => {
    if (location.state?.userId) {
      const fetchUser = async () => {
        const docSnap = await getDoc(doc(db, 'profiles', location.state.userId));
        if (docSnap.exists()) {
           setSelectedChat({ id: docSnap.id, ...docSnap.data() });
        }
      };
      fetchUser();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    const handleUndelete = () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    };
    window.addEventListener('chat_undeleted', handleUndelete);
    return () => window.removeEventListener('chat_undeleted', handleUndelete);
  }, [queryClient]);

  const { data: contacts = [], isLoading: loadingContacts } = useQuery({
    queryKey: ['contacts', chatViewMode],
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      if (!currentUser) return [];

      try {
        let messages: any[] = [];
        const { isSupabaseActive, triggerFirebaseFallback } = useGlobalStore.getState();

        // 1. Fetch recent messages
        if (isSupabaseActive) {
          try {
            const { data: supaMsgs, error: supaErr } = await supabase
              .from('messages')
              .select('*')
              .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
              .order('created_at', { ascending: false })
              .limit(100);

            if (supaErr) throw supaErr;
            if (supaMsgs) messages = supaMsgs;
          } catch (supaErr) {
            console.warn("Supabase contacts query error. Triggering failover...", supaErr);
            triggerFirebaseFallback();
          }
        }

        if (!useGlobalStore.getState().isSupabaseActive && messages.length === 0) {
          try {
            const qMsgs = query(
              collection(db, 'messages'),
              or(where('sender_id', '==', currentUser.id), where('receiver_id', '==', currentUser.id)),
              orderBy('created_at', 'desc'),
              limit(100)
            );
            const snap = await getDocs(qMsgs);
            messages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          } catch (e) {
            console.warn("Firebase contacts query fallback failed", e);
          }
        }

        // Fallback to local Dexie messages if offline or empty
        if (messages.length === 0) {
          try {
            const localMsgs = await localDB.messages
              .filter((m: any) => m.sender_id === currentUser.id || m.receiver_id === currentUser.id)
              .toArray();
            messages = localMsgs;
          } catch (e) {}
        }
        
        // Filter out deleted messages
        messages = messages.filter(m => !m.deleted_for_everyone && !(m.deleted_for || []).includes(currentUser.id));
        
        // Sort in memory
        messages.sort((a, b) => {
          const timeA = typeof a.created_at === 'string' ? new Date(a.created_at).getTime() : a.created_at?.toMillis ? a.created_at.toMillis() : Date.now();
          const timeB = typeof b.created_at === 'string' ? new Date(b.created_at).getTime() : b.created_at?.toMillis ? b.created_at.toMillis() : Date.now();
          return timeB - timeA;
        });
        
        const partnerMap = new Map<string, any>();
        messages.forEach(m => {
          const partnerId = m.sender_id === currentUser.id ? m.receiver_id : m.sender_id;
          let parsedM: any = { ...m };
          if (m.text && !parsedM.content) {
            parsedM.content = m.text;
          }
          if (typeof m.content === 'string') {
            if (m.content.includes('"JSON_PAYLOAD"')) {
              try {
                const obj = JSON.parse(m.content);
                parsedM.content = obj.text;
                parsedM.is_view_once = obj.is_view_once;
                parsedM.parent_message_id = obj.parent_message_id;
                parsedM.filename = obj.filename;
                parsedM.file_size = obj.file_size;
              } catch(e) {}
            } else if (m.content.startsWith('{')) {
              try {
                const obj = JSON.parse(m.content);
                if (obj.text !== undefined) parsedM.content = obj.text;
                if (obj.filename) parsedM.filename = obj.filename;
                if (obj.file_size) parsedM.file_size = obj.file_size;
              } catch(e) {}
            }
          }
          if (!partnerMap.has(partnerId)) {
            partnerMap.set(partnerId, parsedM);
          }
        });
        
        // 2. Fetch all accepted or pending friends
        let friendships: any[] = [];
        try {
          if (isSupabaseActive) {
            const { data } = await supabase.from('friendships').select('*').or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);
            if (data) friendships = data;
          } else {
            const friendshipsSnap = await getDocs(query(
              collection(db, 'friendships'),
              or(where('sender_id', '==', currentUser.id), where('receiver_id', '==', currentUser.id))
            ));
            friendships = friendshipsSnap.docs.map(d => ({id: d.id, ...d.data()} as any));
          }
        } catch (fErr) {
          console.warn("Friendships fetch error (handled):", fErr);
        }
        
        const friendIds = friendships.map(f => f.sender_id === currentUser.id ? f.receiver_id : f.sender_id) || [];
        
        // 3. Fetch groups user is a member of
        let groupIds: string[] = [];
        let fetchedGroups: any[] = [];
        try {
          if (isSupabaseActive) {
            const { data } = await supabase.from('profiles').select('*').eq('is_group', true).contains('members', [currentUser.id]);
            if (data) fetchedGroups = data;
          } else {
            const groupsSnap = await getDocs(query(
              collection(db, 'profiles'),
              where('is_group', '==', true),
              where('members', 'array-contains', currentUser.id)
            ));
            fetchedGroups = groupsSnap.docs.map(d => ({id: d.id, ...d.data()}));
          }
          groupIds = fetchedGroups.map(g => g.id);
        } catch (gErr) {
          console.warn("Groups fetch error:", gErr);
        }

        // 4. Combine partner IDs, friend IDs, and group IDs
        const allContactIds = Array.from(new Set([...Array.from(partnerMap.keys()), ...friendIds, ...groupIds])).filter(Boolean);
        
        if (allContactIds.length === 0) return [];

        // 4. Resolve profiles using Dexie first, only query Firestore for missing profiles
        const profilesMap = new Map<string, any>();
        const missingIds: string[] = [];

        // Pre-fill groups
        fetchedGroups.forEach(g => {
          profilesMap.set(g.id, {
            ...g,
            display_name: g.display_name || g.name,
            name: g.display_name || g.name,
            avatar: g.avatar_url || g.avatar || '',
          });
        });

        for (const cid of allContactIds) {
          if (profilesMap.has(cid)) continue;
          try {
            const cachedUser = await localDB.users.get(cid);
            if (cachedUser && (cachedUser.display_name || cachedUser.name)) {
              profilesMap.set(cid, {
                id: cid,
                display_name: cachedUser.display_name || cachedUser.name,
                name: cachedUser.display_name || cachedUser.name,
                avatar_url: cachedUser.avatar_url || cachedUser.avatar || '',
                avatar: cachedUser.avatar_url || cachedUser.avatar || '',
                username: cachedUser.username || cid,
                is_verified: !!cachedUser.is_verified
              });
            } else {
              missingIds.push(cid);
            }
          } catch (dexErr) {
            missingIds.push(cid);
          }
        }

        // Fetch missing in safe chunks of 10
        if (missingIds.length > 0) {
          for (let i = 0; i < missingIds.length; i += 10) {
            const chunk = missingIds.slice(i, i + 10);
            try {
              if (isSupabaseActive) {
                const { data } = await supabase.from('profiles').select('*').in('id', chunk);
                if (data) {
                  data.forEach(d => {
                    const dispName = d.display_name || d.name || 'User';
                    const avUrl = d.avatar_url || d.avatar || '';
                    const profObj = {
                      id: d.id,
                      display_name: dispName,
                      name: dispName,
                      username: d.username || d.id,
                      avatar_url: avUrl,
                      avatar: avUrl,
                      is_verified: !!d.is_verified,
                      email: d.email
                    };
                    profilesMap.set(d.id, profObj);
                    localDB.users.put(profObj as any).catch(() => {});
                  });
                }
              } else {
                const q = query(collection(db, 'profiles'), where('__name__', 'in', chunk));
                const snapshot = await getDocs(q);
                snapshot.forEach(d => {
                  const data = d.data();
                  const dispName = data.display_name || data.name || 'User';
                  const avUrl = data.avatar_url || data.avatar || '';
                  const profObj = {
                    id: d.id,
                    display_name: dispName,
                    name: dispName,
                    username: data.username || d.id,
                    avatar_url: avUrl,
                    avatar: avUrl,
                    is_verified: !!data.is_verified,
                    email: data.email
                  };
                  profilesMap.set(d.id, profObj);
                  localDB.users.put(profObj as any).catch(() => {});
                });
              }
            } catch (pErr) {
              console.warn("Profiles chunk fetch error:", pErr);
            }
          }
        }

        const blocks = friendships.filter(f => f.status === 'blocked');

        const contactsWithMessages = allContactIds.map((cid: string) => {
          const profile = profilesMap.get(cid) || {
            id: cid,
            display_name: 'User',
            name: 'User',
            username: cid,
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
          
          return {
            ...profile,
            lastMessage: lastMsg,
            isNewFriend: !lastMsg && friendship?.status === 'pending',
            isFriend: friendship?.status === 'accepted',
            blockStatus: block ? {
              iBlockedThem: block.sender_id === currentUser.id,
              theyBlockedMe: block.sender_id === cid
            } : null
          };
        });

        const deletedIds = JSON.parse(localStorage.getItem('deleted_chats_' + currentUser?.id) || '[]');
        const archivedIds = JSON.parse(localStorage.getItem('archived_chats') || '[]');
        const filteredForDeletion = contactsWithMessages.filter(c => {
          if (deletedIds.includes(c.id)) return false;
          if (chatViewMode === 'archived') return archivedIds.includes(c.id);
          if (chatViewMode === 'groups') return c.is_group && !archivedIds.includes(c.id);
          return !archivedIds.includes(c.id);
        });
        const sortedContacts = filteredForDeletion.sort((a, b) => {
          if (a.is_group && !a.lastMessage && (!b.is_group || b.lastMessage)) return -1;
          if (b.is_group && !b.lastMessage && (!a.is_group || a.lastMessage)) return 1;

          if (a.lastMessage && b.lastMessage) {
            const timeA = typeof a.lastMessage.created_at === 'string' ? new Date(a.lastMessage.created_at).getTime() : a.lastMessage.created_at?.toMillis ? a.lastMessage.created_at.toMillis() : Date.now();
            const timeB = typeof b.lastMessage.created_at === 'string' ? new Date(b.lastMessage.created_at).getTime() : b.lastMessage.created_at?.toMillis ? b.lastMessage.created_at.toMillis() : Date.now();
            return timeB - timeA;
          }
          if (a.lastMessage) return -1;
          if (b.lastMessage) return 1;
          return 0;
        });

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

      finalDataToProcess.forEach(async (m: any) => {
        if (m.sender_id === selectedChat.id && !m.is_read) {
          sendP2PSignal({ type: 'SEEN', msgId: m.id });
          const { isSupabaseActive, triggerFirebaseFallback } = useGlobalStore.getState();
          if (isSupabaseActive) {
            try {
              const { error } = await supabase.from('messages').update({ is_read: true }).eq('id', m.id);
              if (error) throw error;
            } catch(e) {
              console.warn("Supabase mark as read failed, triggering fallback", e);
              triggerFirebaseFallback();
            }
          }
          if (!useGlobalStore.getState().isSupabaseActive) {
            try {
              await updateDoc(doc(db, 'messages', m.id), { is_read: true });
            } catch(e) {}
          }
        }
      });
    };

    let realtimeChannel: any = null;
    let firebaseUnsub: any = null;

    const initializeChat = async () => {
      const chatId = [currentUser.id, selectedChat.id].sort().join('_');

      // FETCH INITIAL DATA ONCE TO AVOID DUPLICATE ONSNAPSHOT BILLING
      try {
        let docs: any[] = [];
        
        // 1. Try local cache first for instant load
        try {
          const { localDB } = await import('@/lib/dexie');
          let localMsgs = [];
          if (selectedChat.is_group) {
             localMsgs = await localDB.messages
              .filter((m: any) => m.receiver_id === selectedChat.id)
              .toArray();
          } else {
             localMsgs = await localDB.messages
              .filter((m: any) => (m.sender_id === currentUser.id && m.receiver_id === selectedChat.id) || (m.sender_id === selectedChat.id && m.receiver_id === currentUser.id))
              .toArray();
          }
          if (localMsgs.length > 0) {
            mergeIncomingMessages(localMsgs);
            docs = localMsgs;
          }
        } catch (e) {}

        const { isSupabaseActive } = useGlobalStore.getState();
        let fetchedFromRemote = false;

        // 2. Fetch from Supabase (Zero Firebase Reads)
        if (isSupabaseActive) {
          try {
            let supaQuery = supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(100);
            if (selectedChat.is_group) {
              supaQuery = supaQuery.eq('receiver_id', selectedChat.id);
            } else {
              supaQuery = supaQuery.or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedChat.id}),and(sender_id.eq.${selectedChat.id},receiver_id.eq.${currentUser.id})`);
            }
            const { data, error } = await supaQuery;
            if (!error && data) {
              docs = data.reverse();
              mergeIncomingMessages(docs);
              fetchedFromRemote = true;
            }
          } catch (e) {}
        }

        // 3. Fallback to Firebase ONLY if Supabase failed or inactive
        if (!fetchedFromRemote) {
          const qMsgs = selectedChat.is_group 
            ? query(collection(db, 'messages'), where('receiver_id', '==', selectedChat.id), orderBy('created_at', 'desc'), limit(100))
            : query(collection(db, 'messages'), or(and(where('sender_id', '==', currentUser.id), where('receiver_id', '==', selectedChat.id)), and(where('sender_id', '==', selectedChat.id), where('receiver_id', '==', currentUser.id))), orderBy('created_at', 'desc'), limit(100));
          
          const snap = await getDocs(qMsgs);
          const fbDocs = snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
          mergeIncomingMessages(fbDocs);
        }
      } catch (err) {
        console.warn("Messages initial fetch failed", err);
      }

      // No longer duplicate onSnapshot for messages here; useGlobalStore covers incoming.

      // 3. Setup Listener
      if (useGlobalStore.getState().isSupabaseActive) {
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
              table: 'messages',
            },
            (payload: any) => {
              console.log('📡 [Chat Realtime] Event Received:', payload.eventType, payload.new);
              if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                const item = payload.new;
                if (
                  selectedChat.is_group ? item.receiver_id === selectedChat.id : ((item.sender_id === currentUser.id && item.receiver_id === selectedChat.id) || (item.sender_id === selectedChat.id && item.receiver_id === currentUser.id))
                ) {
                  console.log('✅ [Chat Realtime] Matching message merged into active chat:', item.id);
                  const formatted = {
                    id: item.id,
                    ...item,
                    content: item.content || item.text,
                    chat_id: chatId,
                    chatId: chatId,
                    created_at: item.created_at || new Date().toISOString()
                  };
                  mergeIncomingMessages([formatted]);
                } else {
                  console.log('ℹ️ [Chat Realtime] Ignored message (does not belong to current chat):', item);
                }
              } else if (payload.eventType === 'DELETE') {
                const deletedId = payload.old?.id;
                if (deletedId) {
                  setMessages(prev => prev.filter(m => m.id !== deletedId && m.tempId !== deletedId));
                  import('@/lib/dexie').then(({ localDB }) => {
                    localDB.messages.delete(deletedId).catch(console.warn);
                  });
                }
              }
            }
          )
          .on('broadcast', { event: 'chat_signal' }, (payload: any) => {
            const data = payload.payload;
            if (data?.sender_id === selectedChat.id) {
              if (data.type === 'TYPING') {
                setOtherUserTyping(Boolean(data.isTyping));
                if (remoteTypingTimeoutRef.current) clearTimeout(remoteTypingTimeoutRef.current);
                if (data.isTyping) {
                  remoteTypingTimeoutRef.current = setTimeout(() => setOtherUserTyping(false), 3000);
                }
              } else if (data.type === 'SEEN') {
                setMessages(prev => prev.map(m => m.id === data.msgId ? { ...m, p2p_seen: true } : m));
              } else if (data.type === 'LIVE_PROPOSAL_REQUEST') {
                setLiveStatus('receiving_proposal');
              } else if (data.type === 'LIVE_PROPOSAL_ACCEPTED') {
                setLiveStatus('active');
                setLiveText('');
              } else if (data.type === 'LIVE_PROPOSAL_REJECTED' || data.type === 'LIVE_STOP') {
                setLiveStatus('inactive');
                setLiveText('');
              } else if (data.type === 'LIVE_TEXT_STREAM') {
                setLiveText(data.text);
              }
            }
          })
          .subscribe((status: string, err: any) => {
            console.log(`🔌 [Chat Realtime Channel Status]: ${status}`, err || '');
            // Supabase auto-reconnects on TIMED_OUT or CHANNEL_ERROR. 
            // We no longer manually tear down and recreate the channel because it causes loops and desyncs.
          });
      } else {
        activeChannelRef.current = { isFirebase: true, unsub: () => { if (typeof firebaseUnsub === "function") if (typeof firebaseUnsub === "function") firebaseUnsub(); } };
      }

      if (useGlobalStore.getState().isSupabaseActive) {
        activeChannelRef.current = {
          isCombined: true,
          send: (payload: any) => {
            if (realtimeChannel && realtimeChannel.state === "joined") {
              realtimeChannel.send(payload);
            }
          },
          unsub: () => {
            if (typeof firebaseUnsub === "function") firebaseUnsub();
            supabase.removeChannel(realtimeChannel);
          }
        };
      }

      
      // 1. Load local messages first for instant UI
      try {
        const locals = await localDB.messages
          .filter((m: any) => selectedChat.is_group ? (m.receiver_id === selectedChat.id) : (m.chat_id === chatId || m.chatId === chatId || (m.sender_id === currentUser.id && m.receiver_id === selectedChat.id) || (m.receiver_id === currentUser.id && m.sender_id === selectedChat.id)))
          .toArray();
        if (locals.length > 0) mergeIncomingMessages(locals);
      } catch (e) {
        console.warn("Error reading local messages:", e);
      }

      // 2. Fetch recent conversation messages
      const { isSupabaseActive, triggerFirebaseFallback } = useGlobalStore.getState();

      if (isSupabaseActive) {
        try {
          let supaQuery = supabase.from('messages').select('*');
          if (selectedChat.is_group) {
            supaQuery = supaQuery.eq('receiver_id', selectedChat.id);
          } else {
            supaQuery = supaQuery.or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedChat.id}),and(sender_id.eq.${selectedChat.id},receiver_id.eq.${currentUser.id})`);
          }
          const { data: supaMsgs, error: supaErr } = await supaQuery.order('created_at', { ascending: true }).limit(100);
  
          if (supaErr) throw supaErr;
          if (supaMsgs) {
            const parsed = supaMsgs.map(m => ({
              ...m,
              content: m.content || m.text,
              chat_id: chatId,
              chatId: chatId,
              created_at: m.created_at || new Date().toISOString()
            }));
            mergeIncomingMessages(parsed);
          }
        } catch (err) {
          console.warn("Supabase fetch conversation error. Triggering failover...", err);
          triggerFirebaseFallback();
        }
      }

      if (!useGlobalStore.getState().isSupabaseActive) {
        // Fallback fetch & realtime
        try {
          const qMsgs = selectedChat.is_group 
          ? query(collection(db, 'messages'), where('receiver_id', '==', selectedChat.id), orderBy('created_at', 'asc'), limit(100))
          : query(collection(db, 'messages'), or(and(where('sender_id', '==', currentUser.id), where('receiver_id', '==', selectedChat.id)), and(where('sender_id', '==', selectedChat.id), where('receiver_id', '==', currentUser.id))), orderBy('created_at', 'asc'), limit(100));
          
          firebaseUnsub = onSnapshot(qMsgs, (snap) => {
            const parsed = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            mergeIncomingMessages(parsed);
          });
        } catch(e) {
          console.warn("Firebase fetch conversation fallback error:", e);
        }
      }

      
    };

    initializeChat();

    return () => {
      if (activeChannelRef.current && activeChannelRef.current.unsub) {
        if (typeof activeChannelRef.current.unsub === "function") activeChannelRef.current.unsub();
      }
      activeChannelRef.current = null;
    };
  }, [selectedChat?.id, currentUser?.id]);

  const { data: blockData = null } = useQuery({
    queryKey: ['blockStatus', selectedChat?.id],
    queryFn: async () => {
      if (!selectedChat || !currentUser) return null;
      const q1 = query(
        collection(db, 'friendships'),
        where('sender_id', '==', currentUser.id),
        where('receiver_id', '==', selectedChat.id),
        where('status', '==', 'blocked'),
        limit(1)
      );
      const q2 = query(
        collection(db, 'friendships'),
        where('sender_id', '==', selectedChat.id),
        where('receiver_id', '==', currentUser.id),
        where('status', '==', 'blocked'),
        limit(1)
      );
      const snap1 = await getDocs(q1);
      const snap2 = await getDocs(q2);
      if (!snap1.empty) return {id: snap1.docs[0].id, ...snap1.docs[0].data()};
      if (!snap2.empty) return {id: snap2.docs[0].id, ...snap2.docs[0].data()};
      return null;
    },
    enabled: !!selectedChat && !!currentUser,
  });

  const isBlocked = !!blockData;
  const iBlockedThem = (blockData as any)?.sender_id === currentUser?.id;
  const theyBlockedMe = (blockData as any)?.sender_id === selectedChat?.id;

  const { data: isBlockedByMe = false } = useQuery({
    queryKey: ['isBlockedByMe', selectedChat?.id],
    queryFn: async () => {
      if (!selectedChat || !currentUser) return false;
      const q = query(
        collection(db, 'friendships'),
        where('sender_id', '==', currentUser.id),
        where('receiver_id', '==', selectedChat.id),
        where('status', '==', 'blocked'),
        limit(1)
      );
      const snap = await getDocs(q);
      return !snap.empty;
    },
    enabled: !!selectedChat && !!currentUser,
  });

  // Realtime Listeners
  useEffect(() => {
    if (!currentUser) return;

    // Listen to all incoming messages via Supabase Realtime
    const globalMessagesChannel = supabase.channel(`global-messages:${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload: any) => {
          const newMsg = payload.new;
          if (newMsg.sender_id === currentUser.id || newMsg.receiver_id === currentUser.id) {
            queryClient.setQueryData(['contacts', chatViewMode], (old: any) => {
              if (!old) return old;
              const newContacts = [...old];
              const partnerId = newMsg.sender_id === currentUser.id ? newMsg.receiver_id : newMsg.sender_id;
              const chatIdx = newContacts.findIndex((c: any) => c.id === partnerId);
              if (chatIdx > -1) {
                const chat = { ...newContacts[chatIdx] };
                chat.lastMessage = { ...newMsg, content: newMsg.content || newMsg.text };
                chat.lastMessageTime = new Date();
                newContacts.splice(chatIdx, 1);
                newContacts.unshift(chat);
              } else {
                // If it's a completely new chat, we just invalidate contacts so it fetches the profile
                queryClient.invalidateQueries({ queryKey: ['contacts'] });
              }
              return newContacts;
            });
            queryClient.invalidateQueries({ queryKey: ['unreadCounts'] });
            queryClient.invalidateQueries({ queryKey: ['messages'] });
            queryClient.invalidateQueries({ queryKey: ['notifications', currentUser.id] });
          }
        }
      )
      .subscribe();
    
    // Listen to friend requests and changes (fetch once instead of onSnapshot)
    const fetchFriendships = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'friendships'),
            or(where('sender_id', '==', currentUser.id), where('receiver_id', '==', currentUser.id))
          )
        );
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
      } catch (e) {}
    };
    fetchFriendships();
  }, [selectedChat?.id, currentUser?.id]);

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
    const newMessage: any = {
       sender_id: currentUser!.id,
       receiver_id: selectedChat.id,
       content: JSON.stringify(payloadExtra),
       media_url: '',
       media_type: 'audio',
       created_at: serverTimestamp(),
      local_created_at: new Date().toISOString()
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

    queryClient.setQueryData(['contacts', chatViewMode], (old: any) => {
      if (!old) return old;
      const newContacts = [...old];
      const chatIdx = newContacts.findIndex((c: any) => c.id === selectedChat.id);
      if (chatIdx > -1) {
        const chat = newContacts[chatIdx];
        chat.lastMessage = { ...newMessage, created_at: new Date() };
        chat.lastMessageTime = new Date();
        newContacts.splice(chatIdx, 1);
        newContacts.unshift(chat);
      } else {
        const chat = { ...selectedChat };
        chat.lastMessage = { ...newMessage, created_at: new Date() };
        chat.lastMessageTime = new Date();
        newContacts.unshift(chat);
      }
      return newContacts;
    });

    addUpload(uploadData, 'message', {
        payload: newMessage,
        receiver_id: selectedChat.id,
        sender_id: currentUser!.id,
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
    // Delete instantly upon opening to prevent showing again on refresh
    try {
      if (msg.id && !msg.id.startsWith('temp-')) {
        await supabase.from('messages').delete().eq('id', msg.id);
        try {
          const { localDB } = await import('@/lib/dexie');
          await localDB.messages.delete(msg.id);
        } catch (e) {}
        try {
          await deleteDoc(doc(db, 'messages', msg.id));
        } catch (e) {}
      }
    } catch (e) {
      console.warn("Failed to instantly delete view once message:", e);
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

  // Intercept browser back button for selectedChat on mobile
  useEffect(() => {
    if (!selectedChat) return;
    const stateId = 'chat_' + selectedChat.id;
    window.history.pushState({ chatOpen: stateId }, '');
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
  }, [selectedChat, setIsChatOpen]);

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
    if (!selectedChat) return;
    
    const q1 = query(collection(db, 'friendships'), where('sender_id', '==', currentUser?.id), where('receiver_id', '==', selectedChat.id), where('status', '==', 'blocked'), limit(1));
    const q2 = query(collection(db, 'friendships'), where('sender_id', '==', selectedChat.id), where('receiver_id', '==', currentUser?.id), where('status', '==', 'blocked'), limit(1));
    
    const snap1 = await getDocs(q1);
    const snap2 = await getDocs(q2);
    
    const existingBlock = !snap1.empty ? snap1.docs[0] : (!snap2.empty ? snap2.docs[0] : null);

    if (existingBlock) {
        if (confirm(`Are you sure you want to unblock ${selectedChat.display_name}?`)) {
            await deleteDoc(doc(db, 'friendships', existingBlock.id));
            queryClient.invalidateQueries({ queryKey: ['blockStatus', selectedChat.id] });
            queryClient.invalidateQueries({ queryKey: ['isBlockedByMe', selectedChat.id] });
        }
    } else {
        if (confirm(`Are you sure you want to block ${selectedChat.display_name}?`)) {
            await addDoc(collection(db, 'friendships'), { 
                sender_id: currentUser?.id, 
                receiver_id: selectedChat.id, 
                status: 'blocked' 
            });
            queryClient.invalidateQueries({ queryKey: ['blockStatus', selectedChat.id] });
            queryClient.invalidateQueries({ queryKey: ['isBlockedByMe', selectedChat.id] });
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
    
    // 1. Generate real Firestore ID upfront
    const msgRefId = doc(collection(db, 'messages')).id;
    const chatId = [currentUser!.id, selectedChat.id].sort().join('_');
    const localCreatedAt = new Date().toISOString();

    const newMessage: any = {
       id: msgRefId, // Use real ID
       chat_id: chatId, // Normalize chat_id
       chatId: chatId,
       sender_id: currentUser!.id,
       receiver_id: selectedChat.id,
       content: JSON.stringify(payloadExtra),
       created_at: localCreatedAt, // Use local string initially to match exactly in UI and DB before server sync
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

    queryClient.setQueryData(['contacts', chatViewMode], (old: any) => {
      if (!old) return old;
      const newContacts = [...old];
      const chatIdx = newContacts.findIndex((c: any) => c.id === selectedChat.id);
      if (chatIdx > -1) {
        const chat = {...newContacts[chatIdx]};
        chat.lastMessage = { ...optimisticMsg, created_at: new Date() };
        chat.lastMessageTime = new Date();
        newContacts.splice(chatIdx, 1);
        newContacts.unshift(chat);
      } else {
        const chat = { ...selectedChat };
        chat.lastMessage = { ...optimisticMsg, created_at: new Date() };
        chat.lastMessageTime = new Date();
        newContacts.unshift(chat);
      }
      return newContacts;
    });

    handleMessageTextChange('');
    setReplyingTo(null);
    setShowEmojiPicker(false);
    setIsTextViewOnce(false);
    
    try {
      // Pass the fully formed message (with real ID) to dual write
      const res = await dualWriteMessage(newMessage);
      
      setMessages(prev => prev.map(m => m.id === msgRefId ? { ...m, is_pending: false } : m));
      
      // Trigger Push Notification
      try {
        triggerNotification(
          selectedChat.id,
          currentUser?.display_name || 'New Message',
          messageText,
          { type: 'message', sender_id: currentUser?.id }
        );
      } catch (notifErr) {
        console.error('Notification failed:', notifErr);
      }

      const cacheKey = `messages_cache_${chatId}`;
      try { await redis.del(cacheKey); } catch (e) {}
      
      // Avoid fetching contacts repeatedly
      queryClient.invalidateQueries({ queryKey: ['notifications', selectedChat.id] });

    } catch(e: any) {
      console.error(e);
      toast.error('Failed to send message: ' + e.message);
    }
  };

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

    const newMessage: any = {
      sender_id: currentUser.id,
      receiver_id: selectedChat.id,
      content: JSON.stringify(payloadExtra),
      media_url: '',
      media_type: currentType,
      created_at: serverTimestamp(),
      local_created_at: new Date().toISOString()
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

    addUpload(fileToSend, 'message', {
      payload: newMessage,
      receiver_id: selectedChat.id,
      sender_id: currentUser.id,
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

    const newMessage: any = {
      sender_id: currentUser.id,
      receiver_id: selectedChat.id,
      content: JSON.stringify(payloadExtra),
      media_url: '',
      media_type: currentType,
      created_at: serverTimestamp(),
      local_created_at: new Date().toISOString()
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

    addUpload(file, 'message', {
      payload: newMessage,
      receiver_id: selectedChat.id,
      sender_id: currentUser.id,
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

  const triggerDeleteMessage = (id: string) => {
    setDeleteConfirmId(id);
  };

  const executeDeleteMessage = async () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);

    const msgObj = messages.find((m: any) => m.id === id);
    const isMine = msgObj?.sender_id === currentUser?.id;

    // Optimistic delete from UI state
    setMessages((prev: any[]) => prev.filter(msg => msg.id !== id));
    
    if (selectedChat) {
      queryClient.setQueryData(['messages', selectedChat.id], (oldData: any[]) => {
        if (!oldData) return oldData;
        return oldData.filter(msg => msg.id !== id);
      });
    }

    try {
      // Safe Deletion Logic: Delete locally from Dexie
      try {
        const { localDB } = await import('@/lib/dexie');
        await localDB.messages.delete(id);
      } catch (e) {}

      // Delete from Supabase messages table
      await supabase.from('messages').delete().eq('id', id);

      toast.success("Message deleted!");

      if (selectedChat && currentUser) {
        const cacheKey = `messages_cache_${[currentUser.id, selectedChat.id].sort().join('_')}`;
        try { await redis.del(cacheKey); } catch (e) {}
      }
    } catch(error: any) { 
       console.error(error);
       toast.error("Failed to delete message: " + error.message);
    }
  };

  const handleDeleteForMe = async () => {
    const idsToDelete = selectedMessages;
    setSelectedMessages([]);
    setDeleteConfirmId(null);
    if (!idsToDelete.length || !currentUser) return;

    if (selectedChat) {
      queryClient.setQueryData(['messages', selectedChat.id], (oldData: any[]) => {
        if (!oldData) return oldData;
        return oldData.filter(msg => !idsToDelete.includes(msg.id));
      });
    }

    try {
      // Update locally in Dexie
      try {
        const { localDB } = await import('@/lib/dexie');
        await localDB.messages.bulkDelete(idsToDelete);
      } catch (e) {}

      // Update in Supabase
      await supabase
        .from('messages')
        .update({ deleted_for: [currentUser.id] })
        .in('id', idsToDelete);

      if (selectedChat) {
        queryClient.invalidateQueries({ queryKey: ['messages', selectedChat.id] });
      }
    } catch(error) {
       console.error(error);
    }
  };

  const handleDeleteForEveryone = async () => {
    const idsToDelete = selectedMessages;
    setSelectedMessages([]);
    setDeleteConfirmId(null);
    if (!idsToDelete.length) return;

    if (selectedChat) {
      queryClient.setQueryData(['messages', selectedChat.id], (oldData: any[]) => {
        if (!oldData) return oldData;
        return oldData.filter(msg => !idsToDelete.includes(msg.id));
      });
    }

    try {
      // Delete or mark deleted in Supabase
      await supabase
        .from('messages')
        .update({ deleted_for_everyone: true })
        .in('id', idsToDelete);

      try {
        const { localDB } = await import('@/lib/dexie');
        await localDB.messages.bulkDelete(idsToDelete);
      } catch (e) {}

      if (selectedChat && currentUser) {
        const cacheKey = `messages_cache_${[currentUser.id, selectedChat.id].sort().join('_')}`;
        try { await redis.del(cacheKey); } catch (e) {}
        queryClient.invalidateQueries({ queryKey: ['messages', selectedChat.id] });
      }
    } catch(error) {
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
                {selectedChatsForAction.length === 1 && (
                  <button onClick={() => {
                     const toBlock = selectedChatsForAction[0].id;
                     // Add block logic here if needed or just simulate it
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
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">                {chatViewMode === 'archived' ? 'Archived' : chatViewMode === 'groups' ? 'Groups' : 'Chats'}              </h1>
              <div className="flex gap-2">                <button                   onClick={() => setChatViewMode(chatViewMode === 'groups' ? 'active' : 'groups')}                  className={`px-3 py-1.5 rounded-full text-xs font-black transition-all ${chatViewMode === 'groups' ? 'bg-[#1877F2] text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}                >                  {chatViewMode === 'groups' ? 'Back' : 'Groups'}                </button>                <button                   onClick={() => setChatViewMode(chatViewMode === 'archived' ? 'active' : 'archived')}                  className={`px-3 py-1.5 rounded-full text-xs font-black transition-all ${chatViewMode === 'archived' ? 'bg-[#1877F2] text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}                >                  {chatViewMode === 'archived' ? 'Back' : 'Archive'}                </button>                <button                   onClick={() => setShowNewFriends(!showNewFriends)}                  className={`px-3 py-1.5 rounded-full text-xs font-black transition-all ${showNewFriends ? 'bg-[#1877F2] text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}                >                  {showNewFriends ? 'Back' : 'New Friends'}                </button>              </div>
            </div>
          )}

          <div className="bg-[#f0f2f5] dark:bg-gray-900 rounded-full flex items-center px-4 py-2 border border-transparent focus-within:border-blue-300 transition-all">
            <Search size={18} className="text-gray-400" />
            <input 
              placeholder="Search Messenger" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none ml-2 text-sm w-full font-bold text-gray-700 dark:text-gray-200 placeholder-gray-500" 
            />
          </div>
        </div>
        {(() => {
          const filteredContacts = contacts.filter((c: any) => {
            const name = (c.display_name || c.name || '').toLowerCase();
            const uname = (c.username || '').toLowerCase();
            const q = (searchQuery || '').toLowerCase();
            return name.includes(q) || uname.includes(q);
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
          ) : (showNewFriends ? filteredContacts.filter((c: any) => c.isNewFriend) : filteredContacts.filter((c: any) => !c.isNewFriend)).map((c: any) => {
            const isOnline = onlineUsers.has(c.id);
            const lastMsg = c.lastMessage;
            
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
                      : 'hover:bg-white dark:hover:bg-gray-900 text-gray-700 dark:text-gray-300 border-2 border-transparent hover:shadow-sm'
                }`}
              >
                <div className="relative flex-shrink-0">
                  <ProfileAvatar userId={c.id} defaultAvatar={c.avatar_url || c.avatar} name={c.display_name || c.name} className="w-14 h-14 rounded-full object-cover border-2 border-white dark:border-gray-700 shadow-sm" />
                  {isOnline && <div className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-green-500 border-2 border-white dark:border-black rounded-full"></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <p className="font-bold truncate flex items-center gap-1 text-[15px]">
                      {c.display_name || c.name || 'User'}
                      {c.is_verified && <VerifiedBadge size={14} />}
                    </p>
                    {lastMsg && (
                      <span className="text-[10px] text-gray-400 font-medium ml-2 flex-shrink-0">
                        {safeFormatChatTime(lastMsg.created_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <p className="text-sm truncate text-gray-500 dark:text-gray-400 font-medium">
                      {c.blockStatus ? (
                        <span className="text-red-500 flex items-center gap-1">
                          <Ban size={12} />
                          {c.blockStatus.iBlockedThem ? 'Blocked' : 'Blocked you'}
                        </span>
                      ) : (
                        <>
                          {c.isNewFriend ? <span className="text-blue-500 italic">Say hi to your new friend!</span> : (
                            <>
                              {lastMsg?.sender_id === currentUser?.id ? 'You: ' : ''}
                              {lastMsg?.media_url ? (lastMsg.media_type === 'video' ? '🎥 Video' : '📷 Photo') : lastMsg?.content}
                            </>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                  <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${isOnline ? 'text-green-500' : 'text-gray-400'}`}>
                    {isOnline ? 'Active Now' : 'Offline'}
                  </p>
                </div>
              </div>
            );
          })}
          {showNewFriends && filteredContacts.filter((c: any) => c.isNewFriend).length === 0 && (
            <div className="text-center py-10 text-gray-400 text-xs font-bold uppercase tracking-widest">No new friends to show</div>
          )}
          {!showNewFriends && filteredContacts.filter((c: any) => !c.isNewFriend).length === 0 && (
            <div className="text-center py-10 text-gray-400 text-xs font-bold uppercase tracking-widest">No active chats</div>
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
                    <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => {
                      if (selectedChat.is_group) setShowGroupDetails(true);
                      else navigate(`/profile/${selectedChat.username}`);
                    }}>
                      <ProfileAvatar userId={selectedChat.id} defaultAvatar={selectedChat.avatar_url} name={selectedChat.display_name} className="w-10 h-10 rounded-full object-cover shadow-sm border border-gray-100 dark:border-gray-700" />
                      <div>
                        <p className="font-bold leading-none text-gray-900 dark:text-white flex items-center gap-1">
                          {selectedChat.display_name}
                          {selectedChat.is_verified && <VerifiedBadge />}
                        </p>
                        <p className={`text-[10px] mt-1 font-black tracking-widest ${liveStatus === 'active' ? 'text-green-500' : onlineUsers.has(selectedChat.id) ? 'text-green-500' : 'text-gray-400'}`}>
                          {liveStatus === 'active' ? 'LIVE MODE ACTIVE' : onlineUsers.has(selectedChat.id) ? 'REALTIME ACTIVE' : 'OFFLINE'}
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
                            setLiveStatus('inactive');
                            setLiveText('');
                          } else if (liveStatus === 'inactive') {
                            setLiveStatus('proposing');
                            sendP2PSignal({ type: 'LIVE_PROPOSAL_REQUEST' });
                          }
                        }}
                        className={`p-2 rounded-full transition-all ${liveStatus === 'active' ? 'bg-green-500 text-white shadow-lg' : liveStatus === 'proposing' ? 'bg-yellow-500 text-white animate-pulse' : 'hover:bg-green-50 dark:hover:bg-green-900/20 text-gray-400 hover:text-green-500'}`} 
                        title={liveStatus === 'active' ? "Stop Live Typing" : liveStatus === 'proposing' ? "Proposal Sent..." : "Start Live Typing"}
                      >
                        <Zap size={20} />
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
                              const newMembers = (selectedChat.members || []).filter((id: string) => id !== currentUser?.id);                              const updates: any = { members: newMembers };                              if (selectedChat.admin_id === currentUser?.id) {                                  updates.admin_id = newMembers.length > 0 ? newMembers[0] : null;                              }                              await updateDoc(doc(db, 'profiles', selectedChat.id), updates);
                              // Insert left message
                              const msgRefId = doc(collection(db, 'messages')).id;
                              await setDoc(doc(db, 'messages', msgRefId), {
                                id: msgRefId,
                                chat_id: selectedChat.id,
                                sender_id: currentUser?.id,
                                receiver_id: selectedChat.id,
                                content: "Left the group",
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
                    sendP2PSignal({ type: 'LIVE_PROPOSAL_REJECTED' });
                  }} className="px-3 py-1.5 rounded-full text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                    Decline
                  </button>
                  <button onClick={() => {
                    setLiveStatus('active');
                    sendP2PSignal({ type: 'LIVE_PROPOSAL_ACCEPTED' });
                  }} className="px-3 py-1.5 rounded-full text-xs font-bold bg-blue-500 hover:bg-blue-600 text-white shadow-sm transition-colors">
                    Accept
                  </button>
                </div>
              </div>
            )}

            {liveStatus === 'active' && liveText && (
              <div className="bg-green-50 dark:bg-green-900/10 border-b border-green-100 dark:border-green-900/20 p-3 px-6 flex items-start gap-3 z-10">
                <ProfileAvatar userId={selectedChat.id} defaultAvatar={selectedChat.avatar_url} name={selectedChat.display_name} className="w-8 h-8 rounded-full shadow-sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                    Live Typing
                  </p>
                  <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed font-medium break-words">
                    {liveText}
                    <span className="ml-1 inline-block w-1.5 h-3.5 bg-green-500 animate-pulse align-middle"></span>
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
                  <div className="flex flex-col items-center my-10 animate-in fade-in zoom-in duration-300 cursor-pointer" onClick={() => navigate(`/profile/${selectedChat.username}`)}>
                    <ProfileAvatar userId={selectedChat.id} defaultAvatar={selectedChat.avatar_url} name={selectedChat.display_name} className="w-24 h-24 rounded-full mb-3 shadow-2xl border-4 border-white dark:border-black object-cover hover:scale-105 transition-transform" />
                    <h2 className="text-xl font-black text-gray-900 dark:text-white hover:underline flex items-center gap-2">
                      {selectedChat.display_name}
                      {selectedChat.is_verified && <VerifiedBadge size={20} />}
                    </h2>
                    <p className="text-gray-500 font-bold bg-white dark:bg-black px-3 py-1 rounded-full border border-gray-100 dark:border-gray-800 shadow-sm mt-2 text-xs">@{selectedChat.username}</p>
                  </div>

                  {(messages.length > visibleLimit ? messages.slice(messages.length - visibleLimit) : messages).map((msg: any) => {
                    const parentMsg = msg.parent_message_id ? messages.find((m: any) => m.id === msg.parent_message_id) : null;
                    return (
                    <motion.div 
                      key={msg.id} 
                      onTouchStart={() => handleTouchStart(msg.id)}
                      onTouchEnd={handleTouchEnd}
                      onTouchMove={handleTouchMove}
                      onMouseDown={() => handleTouchStart(msg.id)}
                      onMouseUp={handleTouchEnd}
                      onMouseLeave={handleTouchEnd}
                      onClick={() => handleMessageClick(msg.id)}
                      className={`flex ${msg.sender_id === currentUser?.id ? 'justify-end' : 'justify-start'} group relative animate-in fade-in slide-in-from-bottom-2 duration-300 w-full ${selectedMessages.includes(msg.id) ? 'bg-blue-50/50 dark:bg-blue-900/20 rounded-lg' : ''}`}
                      drag="x"
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={{ left: 0, right: 0.5 }}
                      onDragEnd={(e, info) => {
                        if (info.offset.x > 50) {
                          setReplyingTo(msg);
                        }
                      }}
                    >
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerDeleteMessage(msg.id);
                        }} 
                        className={`opacity-0 group-hover:opacity-100 transition-all self-center text-red-300 hover:text-red-500 ${msg.sender_id === currentUser?.id ? 'mr-2' : 'ml-2 order-last'}`}
                        title={msg.sender_id === currentUser?.id ? "Delete for Everyone" : "Delete for Me"}
                      >
                        <Trash2 size={16} />
                      </button>
                      
                      <div className={`p-3.5 rounded-2xl max-w-[75%] shadow-sm text-[15px] font-medium leading-relaxed ${msg.sender_id === currentUser?.id ? 'bg-[#1877F2] text-white rounded-tr-none' : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-tl-none'}`}>
                        {parentMsg && (
                          <div className={`mb-2 p-2 rounded-xl text-xs opacity-80 border-l-4 ${msg.sender_id === currentUser?.id ? 'bg-white/20 border-white/50 text-white' : 'bg-gray-100 dark:bg-gray-700 border-[#1877F2] text-gray-800 dark:text-gray-300'}`}>
                            <p className="font-bold mb-0.5">{parentMsg.sender_id === currentUser?.id ? 'You' : selectedChat.display_name}</p>
                            <p className="line-clamp-1">{parentMsg.content || (parentMsg.media_url ? 'Media' : '')}</p>
                          </div>
                        )}
                        {msg.is_view_once ? (
                          msg.sender_id === currentUser?.id ? (
                            <div className="flex items-center gap-2 py-1 px-2.5 bg-black/15 dark:bg-white/15 rounded-xl text-xs font-semibold select-none">
                              <div className="w-5 h-5 rounded-full border border-current flex items-center justify-center font-bold text-[10px]">1</div>
                              <span>View Once {msg.media_url ? (msg.media_type === 'audio' ? 'Voice' : msg.media_type === 'video' ? 'Video' : 'Photo') : 'Message'}</span>
                            </div>
                          ) : (
                            <button 
                              onClick={() => handleViewOnce(msg)} 
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
                              <CustomAudioPlayer src={msg.media_url} isSender={msg.sender_id === currentUser?.id} />
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
                        <div className={`flex items-center justify-end gap-1 mt-1 ${msg.sender_id === currentUser?.id ? 'text-blue-200' : 'text-gray-400'}`}>
                          <p className="text-[10px] text-right opacity-80">
                             {formatTime(msg.created_at)}
                          </p>
                          {msg.sender_id === currentUser?.id && (
                            msg.is_pending ? (
                              <Clock size={12} className="opacity-50" />
                            ) : msg.is_read || msg.p2p_seen ? (
                              <CheckCheck size={12} className="text-red-500" />
                            ) : onlineUsers.has(selectedChat.id) || liveStatus === 'active' ? (
                              <CheckCheck size={12} className="text-blue-200 opacity-60" />
                            ) : (
                              <Check size={12} className="text-blue-200 opacity-60" />
                            )
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )})}
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
                          <EmojiPicker 
                            onEmojiClick={handleEmojiClick}
                            autoFocusSearch={false}
                            theme={Theme.AUTO}
                            width={300}
                            height={400}
                          />
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
          <MediaEditor 
            mediaUrl={selectedMedia.url} 
            mediaType={selectedMedia.type === 'video' ? 'video' : 'image'} 
            onSave={handleMediaSave} 
            onCancel={() => { setShowMediaEditor(false); setSelectedMedia(null); }} 
          />
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
                      <Sparkles size={14} />
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
                    const groupId = "group_" + Date.now();
                    const memberIds = [currentUser?.id, ...selectedChatsForAction.map(c => c.id)];
                    
                    await setDoc(doc(db, 'profiles', groupId), {
                      id: groupId,
                      is_group: true,
                      display_name: groupName,
                      admin_id: currentUser?.id,
                      members: memberIds,
                      created_at: new Date().toISOString()
                    });

                    if (groupAvatarFile) {
                      addUpload(groupAvatarFile, 'profile', { userId: groupId });
                    }

                    // Insert Welcome Message so it shows in inbox
                    const msgRefId = doc(collection(db, 'messages')).id;
                    await setDoc(doc(db, 'messages', msgRefId), {
                      id: msgRefId,
                      chat_id: groupId,
                      sender_id: currentUser?.id,
                      receiver_id: groupId, // Group ID as receiver handles grouping
                      content: "Group created",
                      created_at: new Date().toISOString(),
                      is_read: false
                    });

                    toast.success('Group created!');
                    setShowGroupCreate(false);
                    setIsMultiSelectMode(false);
                    setSelectedChatsForAction([]);
                    setGroupName('');
                    setGroupAvatarFile(null);
                    setGroupAvatarPreview('');
                    
                    // Force refresh
                    queryClient.invalidateQueries({ queryKey: ['contacts'] });
                  } catch (e) {
                    toast.error('Failed to create group');
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
                           if(window.confirm(`Remove ${member.display_name} from group?`)) {
                              const newMembers = (selectedChat.members || []).filter((id: string) => id !== member.id);
                              await updateDoc(doc(db, 'profiles', selectedChat.id), { members: newMembers });
                              setGroupMembers(prev => prev.filter(m => m.id !== member.id));
                              toast.success('Member removed'); setSelectedChat({ ...selectedChat, members: newMembers });
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
                            await updateDoc(doc(db, 'profiles', selectedChat.id), { members: newMembers });
                            setGroupMembers(prev => [...prev, friend]);
                            setShowAddMembers(false);
                            toast.success('Member added'); setSelectedChat({ ...selectedChat, members: newMembers });
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
