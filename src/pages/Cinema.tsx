import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { Peer } from 'peerjs';
import YouTube from 'react-youtube';
import {
  Play, Pause, Mic, MicOff, Video, VideoOff,
  Users, Lock, Unlock, LogOut, Send, Trash2, StepForward, Image as ImageIcon, SmilePlus,
  X, Copy, Check, Loader2, ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';
import { VideoStreamPlayer } from '@/components/VideoStreamPlayer';
import { DraggablePip } from '@/components/DraggablePip';
import { RemoteAudioStream } from '@/components/RemoteAudioStream';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { getDynamicIceConfig } from '@/lib/webrtcConfig';
import { useContentFilter } from '@/hooks/useContentFilter';
import { supabase } from '@/lib/supabase';

// Types
interface UserProfile {
  id: string;
  name: string;
  username: string;
  avatar: string;
}

interface ChatMessage {
  id: string;
  sender: UserProfile;
  text: string;
  timestamp: number;
  imageUrl?: string;
}

interface Participant {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
  isHost: boolean;
  peerId?: string;
  isSpeaking?: boolean;
  hasCamera?: boolean;
  joinedAt?: number;
}

interface CinemaSessionState {
  roomCode: string;
  view: 'ENTRY' | 'LOBBY' | 'ROOM';
  isHost: boolean;
  hostUserId: string;
  videoId: string;
  inputUrl: string;
  queueUrl: string;
  isLocked: boolean;
  chatMessages: ChatMessage[];
  updatedAt: number;
}

const CINEMA_SESSION_KEY = 'cinema_session_v2';

const normalizeRoomCode = (raw: string): string => {
  let code = (raw || '').trim().toUpperCase();
  if (/^\d{4}$/.test(code)) code = `C${code}`;
  return code;
};

const mergeChatMessages = (existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  const map = new Map<string, ChatMessage>();
  [...existing, ...incoming].forEach((m) => {
    if (m && m.id) map.set(m.id, m);
  });
  return Array.from(map.values())
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 120);
};

const Cinema: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { scanFile } = useContentFilter();
  const [searchParams] = useSearchParams();
  const params = useParams();
  const urlRoomCode = searchParams.get('code') || params.id || '';
  const urlIsHost = searchParams.get('host') === 'true';

  const [view, setView] = useState<'ENTRY' | 'LOBBY' | 'ROOM'>('ENTRY');
  const [roomCode, setRoomCode] = useState(urlRoomCode ? normalizeRoomCode(urlRoomCode) : '');
  const [joinCode, setJoinCode] = useState(urlRoomCode ? normalizeRoomCode(urlRoomCode) : '');
  const [isHost, setIsHost] = useState(urlIsHost);
  const [hostUserId, setHostUserId] = useState<string>('');
  const [isLocked, setIsLocked] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);

  // Player State
  const playerRef = useRef<any>(null);
  const [videoId, setVideoId] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [queueUrl, setQueueUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Realtime & P2P Media State
  const realtimeChannelRef = useRef<any>(null);
  const activeChannelRoomRef = useRef<string>('');
  const peerRef = useRef<Peer | null>(null);
  const myPeerIdRef = useRef<string>('');
  const calledPeersRef = useRef<Set<string>>(new Set());
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [showParticipants, setShowParticipants] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Media Streams & Audio Ducking
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [micEnabled, setMicEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [activeCameraPeers, setActiveCameraPeers] = useState<Set<string>>(new Set());
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(new Set());

  // Web Audio Context for ducking & keep-alive
  const audioContextRef = useRef<AudioContext | null>(null);
  const duckingIntervalRef = useRef<any>(null);
  const typingTimerRef = useRef<any>(null);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: number; emoji: string; left: number }[]>([]);

  // Refs for fresh closures
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  const videoIdRef = useRef(videoId);
  useEffect(() => { videoIdRef.current = videoId; }, [videoId]);

  const queueUrlRef = useRef(queueUrl);
  useEffect(() => { queueUrlRef.current = queueUrl; }, [queueUrl]);

  const isHostRef = useRef(isHost);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  const hostUserIdRef = useRef(hostUserId);
  useEffect(() => { hostUserIdRef.current = hostUserId; }, [hostUserId]);

  const isLockedRef = useRef(isLocked);
  useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);

  const roomCodeRef = useRef(roomCode);
  useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);

  const chatMessagesRef = useRef(chatMessages);
  useEffect(() => { chatMessagesRef.current = chatMessages; }, [chatMessages]);

  const participantsRef = useRef(participants);
  useEffect(() => { participantsRef.current = participants; }, [participants]);

  const micEnabledRef = useRef(micEnabled);
  useEffect(() => { micEnabledRef.current = micEnabled; }, [micEnabled]);

  const videoEnabledRef = useRef(videoEnabled);
  useEffect(() => { videoEnabledRef.current = videoEnabled; }, [videoEnabled]);

  const speakingPeersRef = useRef(speakingPeers);
  useEffect(() => { speakingPeersRef.current = speakingPeers; }, [speakingPeers]);

  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);

  const lastSyncStateRef = useRef<{ time: number; state: 'PLAYING' | 'PAUSED'; videoId: string } | null>(null);

  // Track compact keyboard viewport so video & chat fit cleanly when keyboard is open
  useEffect(() => {
    const updateViewport = () => {
      const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      setIsCompactViewport(h < 540);
    };
    updateViewport();
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  // Keep newest message visible at top when chat list updates
  useEffect(() => {
    if (chatContainerRef.current && chatMessages.length > 0) {
      chatContainerRef.current.scrollTop = 0;
    }
  }, [chatMessages.length]);

  // Persist active Cinema session across route switches (Lobby or Room -> Inbox -> back to Cinema)
  useEffect(() => {
    if (view === 'ENTRY' || !roomCode) return;
    try {
      const snapshot: CinemaSessionState = {
        roomCode,
        view,
        isHost,
        hostUserId: hostUserId || (isHost && currentUser?.id ? currentUser.id : ''),
        videoId,
        inputUrl,
        queueUrl,
        isLocked,
        chatMessages: chatMessages.slice(0, 60),
        updatedAt: Date.now()
      };
      sessionStorage.setItem(CINEMA_SESSION_KEY, JSON.stringify(snapshot));
      sessionStorage.setItem('active_room_code', roomCode);
      sessionStorage.setItem('active_room_type', 'cinema');
      sessionStorage.setItem('active_room_is_host', String(isHost));
    } catch (_) {}
  }, [view, roomCode, isHost, hostUserId, videoId, inputUrl, queueUrl, isLocked, chatMessages, currentUser?.id]);

  // UNMOUNT CLEANUP: Release active hardware streams & network listeners WITHOUT erasing sessionStorage!
  // This ensures navigating to Inbox to send a room code preserves your setup/room when returning!
  useEffect(() => {
    return () => {
      if (duckingIntervalRef.current) {
        clearInterval(duckingIntervalRef.current);
        duckingIntervalRef.current = null;
      }
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      if (realtimeChannelRef.current) {
        try { supabase.removeChannel(realtimeChannelRef.current); } catch (_) {}
        realtimeChannelRef.current = null;
        activeChannelRoomRef.current = '';
      }
      if (peerRef.current) {
        try { peerRef.current.destroy(); } catch (_) {}
        peerRef.current = null;
      }
      calledPeersRef.current.clear();
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch (_) {}
        audioContextRef.current = null;
      }
      if (localStreamRef.current) {
        try { localStreamRef.current.getTracks().forEach(track => track.stop()); } catch (_) {}
        localStreamRef.current = null;
      }
      if ((window as any).cinemaLocalStream) {
        try { (window as any).cinemaLocalStream.getTracks().forEach((t: MediaStreamTrack) => t.stop()); } catch (_) {}
        (window as any).cinemaLocalStream = null;
      }
    };
  }, []);

  const extractVideoId = (url: string) => {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([^&?/]+)/);
    if (match) return match[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) return url.trim();
    return null;
  };

  // --------------------------------------------------------------------------
  // BACKGROUND KEEP-ALIVE & SILENT AUDIO CONTEXT
  // --------------------------------------------------------------------------
  const initAudioContext = () => {
    if (!audioContextRef.current) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
      } catch (e) {
        console.warn('AudioContext init warning:', e);
      }
    }
  };

  // --------------------------------------------------------------------------
  // AUDIO DUCKING (Voice over Movie)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const checkVoiceActivity = () => {
      const anySpeaking = isLocalSpeaking || speakingPeersRef.current.size > 0 || micEnabled;
      if (playerRef.current && typeof playerRef.current.setVolume === 'function') {
        try {
          playerRef.current.setVolume(anySpeaking ? 10 : 100);
        } catch (_) {}
      }
    };
    duckingIntervalRef.current = setInterval(checkVoiceActivity, 400);
    return () => {
      if (duckingIntervalRef.current) clearInterval(duckingIntervalRef.current);
    };
  }, [isLocalSpeaking, micEnabled]);

  // --------------------------------------------------------------------------
  // BROADCAST OVER SUPABASE REALTIME ROOM CHANNEL
  // --------------------------------------------------------------------------
  const broadcast = useCallback((data: any) => {
    const ch = realtimeChannelRef.current;
    if (!ch) return;
    try {
      ch.send({
        type: 'broadcast',
        event: 'cinema_event',
        payload: {
          ...data,
          senderUserId: currentUser?.id || '',
          senderPeerId: myPeerIdRef.current || ''
        }
      }).catch(() => {});
    } catch (e) {
      console.warn('[Cinema] Broadcast warning:', e);
    }
  }, [currentUser?.id]);

  // Voice level detection on local stream
  useEffect(() => {
    if (!localStream || !micEnabled) {
      setIsLocalSpeaking(false);
      return;
    }

    try {
      const audioTrack = localStream.getAudioTracks()[0];
      if (!audioTrack || !audioTrack.enabled) {
        setIsLocalSpeaking(false);
        return;
      }

      initAudioContext();
      if (!audioContextRef.current) return;

      const source = audioContextRef.current.createMediaStreamSource(localStream);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      let animFrame: number;
      let lastSentSpeaking = false;

      const checkLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const avg = sum / bufferLength;
        const speaking = avg > 18;
        setIsLocalSpeaking(speaking);

        if (speaking !== lastSentSpeaking) {
          lastSentSpeaking = speaking;
          broadcast({ type: 'SPEAKING_STATE', isSpeaking: speaking });
        }

        animFrame = requestAnimationFrame(checkLevel);
      };

      checkLevel();
      return () => {
        cancelAnimationFrame(animFrame);
        try { source.disconnect(); } catch (_) {}
      };
    } catch (e) {
      console.warn('Voice activity error:', e);
    }
  }, [localStream, micEnabled, broadcast]);

  // --------------------------------------------------------------------------
  // PEERJS FOR WEBRTC AUDIO/VIDEO STREAMING
  // --------------------------------------------------------------------------
  const syncMyPresence = useCallback(() => {
    const ch = realtimeChannelRef.current;
    if (!ch || !currentUser) return;
    try {
      ch.track({
        id: currentUser.id,
        name: currentUser.display_name || (currentUser as any)?.name || currentUser.username || 'Friend',
        username: currentUser.username || '',
        avatar: currentUser.avatar_url || '',
        isHost: isHostRef.current,
        peerId: myPeerIdRef.current || '',
        hasCamera: videoEnabledRef.current,
        joinedAt: Date.now()
      }).catch(() => {});
    } catch (_) {}
  }, [currentUser]);

  const callAllPresentPeers = useCallback((stream: MediaStream) => {
    if (!peerRef.current || peerRef.current.destroyed) return;
    participantsRef.current.forEach((p) => {
      if (p.id !== currentUser?.id && p.peerId && p.peerId !== myPeerIdRef.current) {
        try {
          peerRef.current!.call(p.peerId, stream);
          calledPeersRef.current.add(p.peerId);
        } catch (e) {
          console.warn('[Cinema] WebRTC call error:', e);
        }
      }
    });
  }, [currentUser?.id]);

  const initPeerForMedia = useCallback((cleanCode: string) => {
    if (!currentUser) return;
    if (peerRef.current && !peerRef.current.destroyed && myPeerIdRef.current.includes(cleanCode.toLowerCase())) {
      return;
    }
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (_) {}
      peerRef.current = null;
    }

    const uidPart = currentUser.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6) || 'u';
    const uniqueSuffix = Math.random().toString(36).slice(2, 6);
    const collisionFreeId = `next-c-${cleanCode.toLowerCase()}-${uidPart}-${uniqueSuffix}`;
    myPeerIdRef.current = collisionFreeId;

    const peer = new Peer(collisionFreeId, {
      config: getDynamicIceConfig()
    });

    peer.on('open', (id) => {
      myPeerIdRef.current = id;
      syncMyPresence();
      const activeStream = (window as any).cinemaLocalStream;
      if (activeStream) {
        callAllPresentPeers(activeStream);
      }
    });

    peer.on('call', (call) => {
      const currentStream = (window as any).cinemaLocalStream;
      call.answer(currentStream || undefined);
      call.on('stream', (remoteMediaStream) => {
        if (!remoteMediaStream) return;
        setRemoteStreams((prev) => ({ ...prev, [call.peer]: remoteMediaStream }));
        const tracks = remoteMediaStream.getVideoTracks ? remoteMediaStream.getVideoTracks() : [];
        if (tracks.length > 0 && tracks[0]?.enabled) {
          setActiveCameraPeers((prev) => new Set(prev).add(call.peer));
        }
      });
    });

    peer.on('error', (err) => {
      console.warn('[Cinema] Peer media notice:', err?.message || err);
    });

    peerRef.current = peer;
  }, [currentUser, syncMyPresence, callAllPresentPeers]);

  // --------------------------------------------------------------------------
  // UNIFIED SUPABASE REALTIME ROOM CONNECTION (Never splits users or fails rejoin!)
  // --------------------------------------------------------------------------
  const applySyncState = useCallback((data: any) => {
    lastSyncStateRef.current = { time: data.time || 0, state: data.state || 'PAUSED', videoId: data.videoId || '' };

    if (data.videoId && data.videoId !== videoIdRef.current) {
      setVideoId(data.videoId);
      videoIdRef.current = data.videoId;
    }
    if (data.queueUrl !== undefined && data.queueUrl !== queueUrlRef.current) {
      setQueueUrl(data.queueUrl);
      queueUrlRef.current = data.queueUrl;
    }
    if (typeof data.isLocked === 'boolean') {
      setIsLocked(data.isLocked);
      isLockedRef.current = data.isLocked;
    }

    if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function' && data.videoId) {
      try {
        const p = playerRef.current;
        const currentTime = p.getCurrentTime() || 0;
        const drift = Math.abs(currentTime - (data.time || 0));
        if (drift > 1.2) {
          p.seekTo(data.time || 0, true);
        }
        const playerState = p.getPlayerState();
        if (data.state === 'PLAYING' && playerState !== 1 && playerState !== 3) {
          p.playVideo();
          setIsPlaying(true);
        } else if (data.state === 'PAUSED' && playerState !== 2) {
          p.pauseVideo();
          setIsPlaying(false);
        }
      } catch (_) {}
    }
  }, []);

  const showReaction = useCallback((emoji: string) => {
    const id = Date.now() + Math.random();
    const left = Math.floor(Math.random() * 80) + 10;
    setFloatingEmojis(prev => [...prev, { id, emoji, left }]);
    setTimeout(() => {
      setFloatingEmojis(prev => prev.filter(e => e.id !== id));
    }, 2000);
  }, []);

  const connectToRoomChannel = useCallback((rawCode: string, hostFlag: boolean) => {
    if (!currentUser) return;
    const cleanCode = normalizeRoomCode(rawCode);
    if (!cleanCode) return;

    initAudioContext();
    initPeerForMedia(cleanCode);

    // Avoid recreating channel if already subscribed to this exact room
    if (realtimeChannelRef.current && activeChannelRoomRef.current === cleanCode) {
      syncMyPresence();
      return;
    }

    if (realtimeChannelRef.current) {
      try { supabase.removeChannel(realtimeChannelRef.current); } catch (_) {}
      realtimeChannelRef.current = null;
    }

    activeChannelRoomRef.current = cleanCode;

    const channel = supabase.channel(`cinema_room:${cleanCode}`, {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: currentUser.id }
      }
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        try {
          const state = channel.presenceState() as Record<string, any[]>;
          const list: Participant[] = [];
          Object.values(state).forEach((arr) => {
            if (Array.isArray(arr) && arr.length > 0) {
              const latest = arr[arr.length - 1];
              if (latest?.id) {
                list.push({
                  id: latest.id,
                  name: latest.name || 'Friend',
                  username: latest.username || '',
                  avatar: latest.avatar || '',
                  isHost: Boolean(latest.isHost),
                  peerId: latest.peerId || '',
                  hasCamera: Boolean(latest.hasCamera),
                  joinedAt: latest.joinedAt || 0
                });
              }
            }
          });

          // Sort Host first, then join order
          list.sort((a, b) => (a.isHost === b.isHost ? (a.joinedAt || 0) - (b.joinedAt || 0) : a.isHost ? -1 : 1));
          setParticipants(list);

          // Record discovered hostUserId if someone in presence is Host
          const remoteHost = list.find(p => p.isHost);
          if (remoteHost && !hostUserIdRef.current) {
            setHostUserId(remoteHost.id);
            hostUserIdRef.current = remoteHost.id;
          }

          // Connect WebRTC stream to any newly arrived peers if our mic/camera is on
          const activeStream = (window as any).cinemaLocalStream;
          if (activeStream && peerRef.current && !peerRef.current.destroyed) {
            list.forEach((p) => {
              if (p.id !== currentUser.id && p.peerId && !calledPeersRef.current.has(p.peerId)) {
                try {
                  peerRef.current!.call(p.peerId, activeStream);
                  calledPeersRef.current.add(p.peerId);
                } catch (_) {}
              }
            });
          }
        } catch (_) {}
      })
      .on('broadcast', { event: 'cinema_event' }, ({ payload: data }: any) => {
        if (!data || data.senderUserId === currentUser.id) return;

        switch (data.type) {
          case 'REQUEST_ROOM_STATE': {
            // Anyone in the active room (Host primarily, or any viewer if Host temporarily navigated away) responds with full snapshot
            const hasActiveState = Boolean(videoIdRef.current || chatMessagesRef.current.length > 0 || isHostRef.current || viewRef.current === 'ROOM');
            if (!hasActiveState) return;
            const currentTime = playerRef.current?.getCurrentTime ? playerRef.current.getCurrentTime() : (lastSyncStateRef.current?.time || 0);
            const playerState = playerRef.current?.getPlayerState ? (playerRef.current.getPlayerState() === 1 ? 'PLAYING' : 'PAUSED') : (lastSyncStateRef.current?.state || 'PAUSED');
            broadcast({
              type: 'ROOM_STATE_SNAPSHOT',
              targetUserId: data.senderUserId,
              hostUserId: hostUserIdRef.current || (isHostRef.current ? currentUser.id : ''),
              videoId: videoIdRef.current,
              time: currentTime || 0,
              state: playerState,
              queueUrl: queueUrlRef.current,
              isLocked: isLockedRef.current,
              chatMessages: chatMessagesRef.current.slice(0, 50)
            });
            // Also if caller has active mic/cam, call the newly joined peer
            const activeStream = (window as any).cinemaLocalStream;
            if (activeStream && peerRef.current && !peerRef.current.destroyed && data.senderPeerId && !calledPeersRef.current.has(data.senderPeerId)) {
              try {
                peerRef.current.call(data.senderPeerId, activeStream);
                calledPeersRef.current.add(data.senderPeerId);
              } catch (_) {}
            }
            break;
          }

          case 'ROOM_STATE_SNAPSHOT': {
            if (data.targetUserId && data.targetUserId !== currentUser.id) return;

            // If original creator rejoins the same room code (even via "Join Instantly"), restore Host authority!
            if (data.hostUserId && data.hostUserId === currentUser.id && !isHostRef.current) {
              setIsHost(true);
              isHostRef.current = true;
              setHostUserId(currentUser.id);
              hostUserIdRef.current = currentUser.id;
              syncMyPresence();
              toast.success('Reclaimed Host controls in room #' + cleanCode);
            } else if (data.hostUserId && !hostUserIdRef.current) {
              setHostUserId(data.hostUserId);
              hostUserIdRef.current = data.hostUserId;
            }

            if (Array.isArray(data.chatMessages) && data.chatMessages.length > 0) {
              setChatMessages((prev) => mergeChatMessages(prev, data.chatMessages));
            }
            if (data.videoId) {
              applySyncState(data);
            } else if (typeof data.isLocked === 'boolean') {
              setIsLocked(data.isLocked);
              isLockedRef.current = data.isLocked;
            }
            break;
          }

          case 'SYNC_STATE':
            if (!isHostRef.current) {
              applySyncState(data);
            }
            break;

          case 'LOCK_STATE':
            if (!isHostRef.current && typeof data.isLocked === 'boolean') {
              setIsLocked(data.isLocked);
              isLockedRef.current = data.isLocked;
            }
            break;

          case 'CHAT_MESSAGE':
            if (data.message) {
              setChatMessages((prev) => mergeChatMessages(prev, [data.message]));
            }
            break;

          case 'DELETE_MESSAGE':
            if (data.messageId) {
              setChatMessages((prev) => prev.filter((m) => m.id !== data.messageId));
            }
            break;

          case 'REACTION':
            if (data.emoji) showReaction(data.emoji);
            break;

          case 'TYPING':
            if (data.user) {
              setTypingUsers((prev) => {
                const next = new Set(prev);
                if (data.isTyping) next.add(data.user);
                else next.delete(data.user);
                return next;
              });
            }
            break;

          case 'SPEAKING_STATE':
            if (data.senderPeerId) {
              setSpeakingPeers((prev) => {
                const next = new Set(prev);
                if (data.isSpeaking) next.add(data.senderPeerId);
                else next.delete(data.senderPeerId);
                return next;
              });
            }
            break;

          case 'CAMERA_STATE':
            if (data.senderPeerId) {
              setActiveCameraPeers((prev) => {
                const next = new Set(prev);
                if (data.enabled) next.add(data.senderPeerId);
                else next.delete(data.senderPeerId);
                return next;
              });
            }
            break;
        }
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          setIsConnecting(false);
          if (hostFlag) {
            setHostUserId(currentUser.id);
            hostUserIdRef.current = currentUser.id;
          }
          syncMyPresence();
          // Request live room state immediately so any rejoining Host or Guest drops right into the active room!
          setTimeout(() => {
            broadcast({ type: 'REQUEST_ROOM_STATE' });
          }, 150);
        }
      });

    realtimeChannelRef.current = channel;
  }, [currentUser, initPeerForMedia, syncMyPresence, broadcast, applySyncState, showReaction]);

  // Keep presence synchronized whenever isHost or room view changes
  useEffect(() => {
    if (realtimeChannelRef.current && view !== 'ENTRY') {
      syncMyPresence();
    }
  }, [isHost, view, videoEnabled, syncMyPresence]);

  // --------------------------------------------------------------------------
  // INITIAL HYDRATION ON MOUNT (URL param or saved Cinema Session)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!currentUser) return;

    // 1. Check saved session from previous visit (before switching to Inbox, etc.)
    let saved: CinemaSessionState | null = null;
    try {
      const raw = sessionStorage.getItem(CINEMA_SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.roomCode && parsed?.view && parsed.view !== 'ENTRY') {
          saved = parsed;
        }
      }
    } catch (_) {}

    if (urlRoomCode) {
      const cleanUrlCode = normalizeRoomCode(urlRoomCode);
      setRoomCode(cleanUrlCode);
      setJoinCode(cleanUrlCode);

      if (saved && saved.roomCode === cleanUrlCode) {
        // Restore full saved state for this room
        setIsHost(saved.isHost || urlIsHost);
        isHostRef.current = saved.isHost || urlIsHost;
        setHostUserId(saved.hostUserId || '');
        hostUserIdRef.current = saved.hostUserId || '';
        setVideoId(saved.videoId || '');
        videoIdRef.current = saved.videoId || '';
        setInputUrl(saved.inputUrl || '');
        setQueueUrl(saved.queueUrl || '');
        queueUrlRef.current = saved.queueUrl || '';
        setIsLocked(Boolean(saved.isLocked));
        isLockedRef.current = Boolean(saved.isLocked);
        if (Array.isArray(saved.chatMessages)) setChatMessages(saved.chatMessages);
        setView(saved.view);
        connectToRoomChannel(cleanUrlCode, saved.isHost || urlIsHost);
      } else if (urlIsHost) {
        setIsHost(true);
        isHostRef.current = true;
        setHostUserId(currentUser.id);
        hostUserIdRef.current = currentUser.id;
        setView('LOBBY');
        connectToRoomChannel(cleanUrlCode, true);
      } else {
        setIsHost(false);
        isHostRef.current = false;
        setView('ROOM');
        connectToRoomChannel(cleanCodeSafe(cleanUrlCode), false);
      }
      return;
    }

    if (saved) {
      console.log(`[Cinema] Restoring active Cinema session (${saved.view}): #${saved.roomCode}`);
      setRoomCode(saved.roomCode);
      setJoinCode(saved.roomCode);
      setIsHost(saved.isHost);
      isHostRef.current = saved.isHost;
      setHostUserId(saved.hostUserId || (saved.isHost ? currentUser.id : ''));
      hostUserIdRef.current = saved.hostUserId || (saved.isHost ? currentUser.id : '');
      setVideoId(saved.videoId || '');
      videoIdRef.current = saved.videoId || '';
      setInputUrl(saved.inputUrl || '');
      setQueueUrl(saved.queueUrl || '');
      queueUrlRef.current = saved.queueUrl || '';
      setIsLocked(Boolean(saved.isLocked));
      isLockedRef.current = Boolean(saved.isLocked);
      if (Array.isArray(saved.chatMessages)) setChatMessages(saved.chatMessages);
      setView(saved.view);
      connectToRoomChannel(saved.roomCode, saved.isHost);
    }
  }, [currentUser?.id, urlRoomCode, urlIsHost]);

  const cleanCodeSafe = (c: string) => normalizeRoomCode(c);

  // --------------------------------------------------------------------------
  // ROOM ENTRY & EXIT HANDLERS
  // --------------------------------------------------------------------------
  const enterRoom = (code: string, hostMode = isHost) => {
    initAudioContext();
    const cleanCode = normalizeRoomCode(code);
    if (!cleanCode) return;

    if (hostMode && inputUrl.trim()) {
      const id = extractVideoId(inputUrl);
      if (id) {
        setVideoId(id);
        videoIdRef.current = id;
      }
      setInputUrl('');
    }

    setRoomCode(cleanCode);
    setView('ROOM');
    connectToRoomChannel(cleanCode, hostMode);

    if (hostMode && videoIdRef.current) {
      setTimeout(() => {
        broadcast({
          type: 'SYNC_STATE',
          time: 0,
          state: 'PLAYING',
          videoId: videoIdRef.current,
          queueUrl: queueUrlRef.current,
          isLocked: isLockedRef.current
        });
      }, 300);
    }
  };

  // Explicit exit ONLY when user clicks Leave Room or Cancel Lobby
  const handleLeaveRoom = () => {
    if (duckingIntervalRef.current) {
      clearInterval(duckingIntervalRef.current);
      duckingIntervalRef.current = null;
    }

    if (realtimeChannelRef.current) {
      try { supabase.removeChannel(realtimeChannelRef.current); } catch (_) {}
      realtimeChannelRef.current = null;
      activeChannelRoomRef.current = '';
    }

    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (_) {}
      peerRef.current = null;
    }
    calledPeersRef.current.clear();

    if (localStream) {
      try { localStream.getTracks().forEach(track => track.stop()); } catch (_) {}
      setLocalStream(null);
    }
    if ((window as any).cinemaLocalStream) {
      try { (window as any).cinemaLocalStream.getTracks().forEach((t: MediaStreamTrack) => t.stop()); } catch (_) {}
      (window as any).cinemaLocalStream = null;
    }

    try {
      sessionStorage.removeItem(CINEMA_SESSION_KEY);
      sessionStorage.removeItem('active_room_code');
      sessionStorage.removeItem('active_room_type');
      sessionStorage.removeItem('active_room_is_host');
    } catch (_) {}

    setParticipants([]);
    setChatMessages([]);
    setRemoteStreams({});
    setActiveCameraPeers(new Set());
    setSpeakingPeers(new Set());
    setVideoId('');
    videoIdRef.current = '';
    setInputUrl('');
    setQueueUrl('');
    setMicEnabled(false);
    setVideoEnabled(false);
    setIsLocalSpeaking(false);
    setIsHost(false);
    isHostRef.current = false;
    setHostUserId('');
    hostUserIdRef.current = '';
    setRoomCode('');
    setJoinCode('');
    setView('ENTRY');

    if (urlRoomCode) {
      navigate('/cinema', { replace: true });
    }
    toast.info('Left the Cinema Hall');
  };

  // --------------------------------------------------------------------------
  // CREATION & JOINING INITIATION
  // --------------------------------------------------------------------------
  const handleCreateTheatre = () => {
    const randomDigits = Math.floor(1000 + Math.random() * 9000).toString();
    const code = `C${randomDigits}`;
    setRoomCode(code);
    setIsHost(true);
    isHostRef.current = true;
    setHostUserId(currentUser?.id || '');
    hostUserIdRef.current = currentUser?.id || '';
    setVideoId('');
    videoIdRef.current = '';
    setChatMessages([]);
    setView('LOBBY');
    connectToRoomChannel(code, true);
  };

  const handleJoinTheatre = () => {
    if (!joinCode.trim()) {
      toast.error('Please enter a room code');
      return;
    }
    const code = normalizeRoomCode(joinCode);

    if (code.startsWith('M') || code.startsWith('MET-')) {
      navigate(`/meet?code=${code}`);
      return;
    }

    setIsConnecting(true);
    setRoomCode(code);
    setJoinCode(code);
    setIsHost(false);
    isHostRef.current = false;
    setHostUserId('');
    hostUserIdRef.current = '';
    setView('ROOM');
    connectToRoomChannel(code, false);
    toast.success(`Joined Cinema Hall #${code}`);
  };

  // --------------------------------------------------------------------------
  // MEDIA (MIC & CAMERA)
  // --------------------------------------------------------------------------
  const getMediaStream = async (reqAudio: boolean, reqVideo: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: reqAudio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 } : false,
        video: reqVideo
      });

      let masterStream: MediaStream = (window as any).cinemaLocalStream;
      if (masterStream) {
        stream.getTracks().forEach(track => {
          const existing = masterStream.getTracks().find(t => t.kind === track.kind);
          if (existing) {
            existing.stop();
            masterStream.removeTrack(existing);
          }
          masterStream.addTrack(track);
        });
      } else {
        masterStream = stream;
        (window as any).cinemaLocalStream = masterStream;
      }

      setLocalStream(masterStream);
      callAllPresentPeers(masterStream);
      return masterStream;
    } catch (e) {
      toast.error(reqVideo ? 'Camera permission denied' : 'Microphone permission denied');
      return null;
    }
  };

  const toggleMic = async () => {
    const masterStream: MediaStream = (window as any).cinemaLocalStream;
    if (micEnabled) {
      if (masterStream) {
        masterStream.getAudioTracks().forEach(t => { t.enabled = false; });
      }
      setMicEnabled(false);
      setIsLocalSpeaking(false);
      broadcast({ type: 'SPEAKING_STATE', isSpeaking: false });
      toast.info('Microphone muted');
    } else {
      if (masterStream && masterStream.getAudioTracks().length > 0) {
        masterStream.getAudioTracks().forEach(t => { t.enabled = true; });
        setMicEnabled(true);
        toast.success('Microphone unmuted');
      } else {
        const stream = await getMediaStream(true, videoEnabled);
        if (stream) {
          setMicEnabled(true);
          toast.success('Microphone active');
        }
      }
    }
  };

  const toggleVideo = async () => {
    const masterStream: MediaStream = (window as any).cinemaLocalStream;
    if (videoEnabled) {
      if (masterStream) {
        masterStream.getVideoTracks().forEach(t => {
          t.enabled = false;
          t.stop();
          masterStream.removeTrack(t);
        });
      }
      setVideoEnabled(false);
      broadcast({ type: 'CAMERA_STATE', enabled: false });
      toast.info('Camera off');
    } else {
      const stream = await getMediaStream(micEnabled, true);
      if (stream) {
        setVideoEnabled(true);
        broadcast({ type: 'CAMERA_STATE', enabled: true });
        toast.success('Camera on');
      }
    }
  };

  // --------------------------------------------------------------------------
  // YOUTUBE SYNCHRONIZATION
  // --------------------------------------------------------------------------
  const onReady = (event: any) => {
    playerRef.current = event.target;
    if (!isHostRef.current && lastSyncStateRef.current) {
      const sync = lastSyncStateRef.current;
      if (sync.time) event.target.seekTo(sync.time, true);
      if (sync.state === 'PLAYING') {
        event.target.playVideo();
        setIsPlaying(true);
      }
    }
  };

  useEffect(() => {
    let syncInterval: any = null;
    if (isHost && view === 'ROOM') {
      syncInterval = setInterval(() => {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function' && videoIdRef.current) {
          const time = playerRef.current.getCurrentTime();
          const state = playerRef.current.getPlayerState();
          broadcast({
            type: 'SYNC_STATE',
            time: time || 0,
            state: state === 1 ? 'PLAYING' : 'PAUSED',
            videoId: videoIdRef.current,
            queueUrl: queueUrlRef.current,
            isLocked: isLockedRef.current
          });
        }
      }, 2500);
    }
    return () => {
      if (syncInterval) clearInterval(syncInterval);
    };
  }, [isHost, view, broadcast]);

  const onStateChange = (event: any) => {
    const newState = event.data === 1;
    setIsPlaying(newState);

    if (!isHostRef.current && isLocked) return;

    if (isHostRef.current) {
      const time = event.target.getCurrentTime();
      broadcast({
        type: 'SYNC_STATE',
        time: time || 0,
        state: event.data === 1 ? 'PLAYING' : 'PAUSED',
        videoId: videoIdRef.current,
        queueUrl: queueUrlRef.current,
        isLocked: isLockedRef.current
      });
    }

    if (event.data === 0 && isHostRef.current && queueUrlRef.current) {
      const nextId = extractVideoId(queueUrlRef.current);
      if (nextId) {
        setVideoId(nextId);
        videoIdRef.current = nextId;
        setQueueUrl('');
        queueUrlRef.current = '';
        broadcast({ type: 'SYNC_STATE', time: 0, state: 'PLAYING', videoId: nextId, queueUrl: '' });
      }
    }
  };

  const onError = (event: any) => {
    const errCode = event.data;
    if (errCode === 101 || errCode === 150) {
      toast.error('Embedding restricted on this YouTube video. Please try another link.');
    } else if (errCode === 2 || errCode === 5) {
      toast.error('Invalid YouTube video link.');
    }
  };

  const handleSetVideo = () => {
    if (!inputUrl.trim()) return;
    const id = extractVideoId(inputUrl);
    if (id) {
      setVideoId(id);
      videoIdRef.current = id;
      setInputUrl('');
      if (isHost) {
        broadcast({
          type: 'SYNC_STATE',
          time: 0,
          state: 'PLAYING',
          videoId: id,
          queueUrl: queueUrlRef.current,
          isLocked: isLockedRef.current
        });
      }
      toast.success('Loaded movie in Cinema Hall!');
    } else {
      toast.error('Invalid YouTube link');
    }
  };

  const togglePlay = () => {
    if (!playerRef.current) return;
    try {
      const state = playerRef.current.getPlayerState();
      const currentTime = playerRef.current.getCurrentTime ? playerRef.current.getCurrentTime() : 0;
      if (state === 1) {
        playerRef.current.pauseVideo();
        setIsPlaying(false);
        if (isHost) {
          broadcast({
            type: 'SYNC_STATE',
            time: currentTime,
            state: 'PAUSED',
            videoId: videoIdRef.current,
            queueUrl: queueUrlRef.current
          });
        }
      } else {
        playerRef.current.playVideo();
        setIsPlaying(true);
        if (isHost) {
          broadcast({
            type: 'SYNC_STATE',
            time: currentTime,
            state: 'PLAYING',
            videoId: videoIdRef.current,
            queueUrl: queueUrlRef.current
          });
        }
      }
    } catch (e) {
      console.warn('Toggle play error:', e);
    }
  };

  const cycleSpeed = () => {
    if (!playerRef.current) return;
    const speeds = [1, 1.25, 1.5, 2, 0.75];
    const nextIndex = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIndex];
    playerRef.current.setPlaybackRate(nextSpeed);
    setPlaybackSpeed(nextSpeed);
  };

  // --------------------------------------------------------------------------
  // CHAT & REACTIONS
  // --------------------------------------------------------------------------
  const handleChatInputChange = (val: string) => {
    setChatInput(val);
    if (!currentUser) return;
    broadcast({ type: 'TYPING', isTyping: val.length > 0, user: currentUser.display_name });

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      broadcast({ type: 'TYPING', isTyping: false, user: currentUser?.display_name });
    }, 2000);
  };

  const sendMessage = () => {
    if (!chatInput.trim() || !currentUser) return;
    const msg: ChatMessage = {
      id: `${currentUser.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sender: {
        id: currentUser.id,
        name: currentUser.display_name,
        username: currentUser.username,
        avatar: currentUser.avatar_url
      },
      text: chatInput.trim(),
      timestamp: Date.now()
    };

    broadcast({ type: 'CHAT_MESSAGE', message: msg });
    setChatMessages(prev => mergeChatMessages(prev, [msg]));
    setChatInput('');
    broadcast({ type: 'TYPING', isTyping: false, user: currentUser.display_name });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const inputEl = e.target;
    if (!file || !currentUser) return;

    const isSafe = await scanFile(file, inputEl);
    if (!isSafe) return;

    const reader = new FileReader();
    reader.onload = () => {
      const msg: ChatMessage = {
        id: `${currentUser.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        sender: {
          id: currentUser.id,
          name: currentUser.display_name,
          username: currentUser.username,
          avatar: currentUser.avatar_url
        },
        text: '',
        imageUrl: reader.result as string,
        timestamp: Date.now()
      };
      broadcast({ type: 'CHAT_MESSAGE', message: msg });
      setChatMessages(prev => mergeChatMessages(prev, [msg]));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const deleteMessage = (id: string) => {
    broadcast({ type: 'DELETE_MESSAGE', messageId: id });
    setChatMessages(prev => prev.filter(m => m.id !== id));
  };

  const sendReaction = (emoji: string) => {
    showReaction(emoji);
    broadcast({ type: 'REACTION', emoji });
  };

  // --------------------------------------------------------------------------
  // VIEW: ENTRY
  // --------------------------------------------------------------------------
  if (view === 'ENTRY') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full w-full p-4 bg-gray-50 dark:bg-black overflow-y-auto">
        <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-xl border border-gray-100 dark:border-gray-800">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Cinema & Meet</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Watch YouTube together with synced audio & live video chat</p>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleCreateTheatre}
                className="bg-[#1877F2] text-white rounded-2xl py-3.5 px-3 font-bold text-sm hover:bg-blue-600 transition-all active:scale-95 shadow-lg shadow-blue-500/30 flex flex-col items-center gap-1.5"
              >
                <Video size={24} />
                <span>Create Cinema</span>
              </button>
              <button
                onClick={() => {
                  const randomDigits = Math.floor(1000 + Math.random() * 9000).toString();
                  const code = `M${randomDigits}`;
                  navigate(`/meet?code=${code}&host=true`);
                }}
                className="bg-[#25D366] text-white rounded-2xl py-3.5 px-3 font-bold text-sm hover:bg-green-600 transition-all active:scale-95 shadow-lg shadow-green-500/30 flex flex-col items-center gap-1.5"
              >
                <Users size={24} />
                <span>Create Meet</span>
              </button>
            </div>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
              <span className="flex-shrink-0 mx-4 text-gray-400 font-semibold text-xs uppercase tracking-wider">OR JOIN WITH CODE</span>
              <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
            </div>

            <div>
              <input
                type="text"
                placeholder="Enter Room Code (e.g. C2838 or M3737)"
                value={joinCode}
                disabled={isConnecting}
                onChange={(e) => setJoinCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isConnecting && handleJoinTheatre()}
                className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl py-4 px-4 text-center font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-[#1877F2] mb-3 outline-none uppercase tracking-wider disabled:opacity-50"
              />
              <button
                onClick={handleJoinTheatre}
                disabled={isConnecting}
                className="w-full bg-gray-900 dark:bg-white dark:text-black text-white rounded-2xl py-4 font-bold text-lg hover:opacity-90 transition-all active:scale-95 shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isConnecting ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    <span>Connecting... Please wait</span>
                  </>
                ) : (
                  <span>Join Instantly ▶</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // VIEW: LOBBY (Host Only - Persists if navigating to Inbox to send code!)
  // --------------------------------------------------------------------------
  if (view === 'LOBBY') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full w-full p-4 bg-black text-white overflow-y-auto relative">
        <button
          onClick={handleLeaveRoom}
          className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-2 rounded-full bg-gray-900 border border-gray-800 text-xs font-bold text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Cancel Room</span>
        </button>

        <div className="max-w-md w-full text-center space-y-6 animate-in fade-in zoom-in duration-300 mt-10">
          <div className="bg-gray-900 border border-gray-800 p-6 sm:p-8 rounded-3xl shadow-2xl">
            <h2 className="text-2xl font-bold mb-2">Cinema Room Code</h2>
            <div className="flex items-center justify-between text-3xl font-black text-[#1877F2] tracking-widest bg-black py-4 px-6 rounded-xl border border-blue-900/30">
              <span>{roomCode}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(roomCode);
                  setIsCopied(true);
                  setTimeout(() => setIsCopied(false), 2000);
                  toast.success('Code copied! You can send it in Inbox and return anytime.');
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                {isCopied ? <Check size={28} className="text-blue-500" /> : <Copy size={28} />}
              </button>
            </div>
            <p className="text-gray-400 mt-4 text-xs sm:text-sm">
              Share this code in Inbox — your Cinema room stays saved while you switch pages.
            </p>

            <div className="mt-6 pt-5 border-t border-gray-800">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                Connected Friends ({participants.length})
              </h4>
              <div className="flex flex-wrap gap-2 justify-center">
                {participants.map(p => (
                  <div key={p.id} className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full border border-gray-800">
                    {p.avatar ? (
                      <ProfileAvatar userId={p.id} defaultAvatar={p.avatar} name={p.name} className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-xs flex items-center justify-center font-bold">
                        {((p?.name || 'U')[0] || 'U').toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs font-bold text-white">{p.name || 'Friend'}</span>
                    {p.isHost && <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1 rounded">Host</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="w-full">
            <input
              type="text"
              placeholder="Paste YouTube Link here (optional)..."
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') enterRoom(roomCode, true);
              }}
              className="w-full bg-gray-900 border border-gray-700 rounded-2xl py-4 px-4 text-center font-medium text-white focus:border-[#1877F2] focus:ring-1 focus:ring-[#1877F2] mb-2 outline-none"
            />
          </div>

          <button
            onClick={() => enterRoom(roomCode, true)}
            className="w-full bg-white text-black rounded-2xl py-4 font-black text-lg hover:bg-gray-200 transition-transform active:scale-95 shadow-2xl shadow-white/10"
          >
            Start Cinema Session ▶
          </button>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // VIEW: ROOM (Active Cinema Theater - Locked Player + Recent-at-Top Chat)
  // --------------------------------------------------------------------------
  return (
    <div className="flex flex-col flex-1 h-full max-h-full min-h-0 w-full bg-black text-white overflow-hidden relative">

      {/* Background Remote Audio Streams */}
      {Object.entries(remoteStreams).map(([peerId, stream]) => (
        <RemoteAudioStream key={`audio-${peerId}`} stream={stream} isMuted={false} />
      ))}

      {/* Draggable PiP Cameras */}
      {videoEnabled && localStream && (
        <DraggablePip
          id="local-pip"
          stream={localStream}
          name="You"
          isLocal={true}
          isMuted={!micEnabled}
          isSpeaking={isLocalSpeaking}
          initialPosition={{ x: 16, y: 70 }}
        />
      )}

      {Object.entries(remoteStreams).map(([peerId, stream], idx) => {
        const p = participants.find(pt => pt.peerId === peerId);
        const tracks = stream?.getVideoTracks ? stream.getVideoTracks() : [];
        const isCameraOn = activeCameraPeers.has(peerId) || Boolean(tracks && tracks.length > 0 && tracks[0]?.enabled);

        if (!isCameraOn) {
          return (
            <VideoStreamPlayer
              key={`hidden-${peerId}`}
              stream={stream}
              isMuted={false}
              className="hidden"
            />
          );
        }

        return (
          <DraggablePip
            key={peerId}
            id={peerId}
            stream={stream}
            name={p?.name || 'Guest'}
            avatar={p?.avatar}
            isLocal={false}
            isMuted={false}
            isSpeaking={speakingPeers.has(peerId)}
            initialPosition={{ x: (typeof window !== 'undefined' ? window.innerWidth : 360) - 160, y: 70 + idx * 160 }}
          />
        );
      })}

      {/* HEADER OVERLAY */}
      <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-black/90 to-transparent z-40 flex items-center justify-between px-3 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <span className="font-black bg-black/70 backdrop-blur px-2.5 py-1 rounded-full text-xs border border-white/10">#{roomCode}</span>
          {isHost && <span className="bg-[#1877F2] text-[10px] font-bold px-2 py-0.5 rounded-full">HOST</span>}
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => setShowParticipants(true)}
            className="flex items-center gap-1.5 text-xs font-bold bg-black/70 backdrop-blur px-3 py-1.5 rounded-full border border-white/10 cursor-pointer hover:bg-white/20 transition-colors"
            title="View participants"
          >
            <Users size={14} className="text-[#1877F2]" />
            <span>{Math.max(participants.length, 1)}</span>
          </button>

          <button
            onClick={handleLeaveRoom}
            className="p-1.5 bg-black/70 backdrop-blur hover:bg-red-500/20 text-white hover:text-red-500 rounded-full transition-colors border border-white/10"
            title="Leave Room"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {/* PARTICIPANTS MODAL POPUP */}
      {showParticipants && (
        <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowParticipants(false)}>
          <div className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-black/40">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Users size={18} className="text-[#1877F2]" />
                  Participants ({Math.max(participants.length, 1)})
                </h3>
                <p className="text-xs text-gray-400">Room: #{roomCode}</p>
              </div>
              <button onClick={() => setShowParticipants(false)} className="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto p-3 space-y-2">
              {participants.filter(Boolean).map((p, i) => (
                <div key={p.id || String(i)} className="flex items-center justify-between p-3 rounded-2xl bg-black/50 border border-gray-800/80">
                  <div className="flex items-center gap-3 min-w-0">
                    {p.avatar ? (
                      <ProfileAvatar userId={p.id || ''} defaultAvatar={p.avatar} name={p.name || 'Guest'} className="w-10 h-10 rounded-full object-cover border border-gray-700 shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold shrink-0">
                        {((p?.name || 'U')[0] || 'U').toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-white text-sm truncate flex items-center gap-1.5">
                        {p.name || 'Guest'}
                        {p.id === currentUser?.id && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-normal">You</span>}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">@{p.username || 'viewer'}</p>
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0 ${p.isHost ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-gray-800 text-gray-300'}`}>
                    {p.isHost ? 'Host' : 'Guest'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* FLOATING REACTIONS */}
      {floatingEmojis.map(e => (
        <div
          key={e.id}
          className="absolute z-50 text-4xl animate-float-up pointer-events-none"
          style={{ left: `${e.left}%`, bottom: '35%' }}
        >
          {e.emoji}
        </div>
      ))}

      {/* 1. LOCKED YOUTUBE PLAYER CONTAINER (Fixed Top Position - Never scrolls away) */}
      <div
        className={`w-full shrink-0 relative bg-black flex items-center justify-center border-b border-gray-800 transition-all ${
          isCompactViewport
            ? 'h-[155px] sm:h-[210px] md:h-[250px]'
            : 'h-[205px] sm:h-[270px] md:h-[310px]'
        }`}
      >
        {!videoId ? (
          <div className="text-center p-4 sm:p-6 bg-gray-900/60 rounded-2xl border border-white/10 w-11/12 max-w-md shadow-xl">
            <Video size={32} className="mx-auto text-gray-600 mb-2 animate-pulse" />
            <h3 className="text-sm sm:text-base font-bold text-gray-300">
              {isHost ? 'Paste a YouTube link below to start' : 'Waiting for Host to play a video...'}
            </h3>
            <p className="text-[11px] text-gray-500 mt-1">All viewers stay synced in room #{roomCode}</p>
          </div>
        ) : (
          <div className="w-full h-full relative group">
            <YouTube
              videoId={videoId}
              opts={{
                width: '100%',
                height: '100%',
                playerVars: {
                  autoplay: 1,
                  controls: isHost ? 1 : (isLocked ? 0 : 1),
                  modestbranding: 1,
                  rel: 0,
                  fs: 0,
                  playsinline: 1,
                  enablejsapi: 1,
                  origin: (typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file:')) ? window.location.origin : undefined
                }
              }}
              className="absolute inset-0 w-full h-full pointer-events-auto"
              onReady={onReady}
              onStateChange={onStateChange}
              onError={onError}
            />
          </div>
        )}
      </div>

      {/* 2. LOCKED CUSTOM CONTROLS BAR */}
      <div className={`shrink-0 bg-gray-950 border-b border-gray-800 flex flex-col ${isCompactViewport ? 'px-2.5 py-1.5 gap-1.5' : 'p-2.5 gap-2'}`}>
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button onClick={togglePlay} className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-colors" title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause size={16} className="text-white" /> : <Play size={16} className="text-white" />}
            </button>
            {isHost && queueUrl && (
              <button onClick={() => {
                const nextId = extractVideoId(queueUrl);
                if (nextId) {
                  setVideoId(nextId);
                  videoIdRef.current = nextId;
                  setQueueUrl('');
                  queueUrlRef.current = '';
                }
              }} className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-colors text-white" title="Next Video">
                <StepForward size={16} />
              </button>
            )}
            <button onClick={cycleSpeed} className="px-2.5 py-1 bg-white/10 rounded-xl hover:bg-white/20 transition-colors font-bold text-xs text-white">
              {playbackSpeed}x
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={toggleMic}
              className={`p-2 rounded-full transition-all active:scale-95 ${micEnabled ? 'bg-green-600 text-white shadow-lg shadow-green-600/30' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
              title={micEnabled ? 'Mute Voice' : 'Unmute Voice (Audio Ducking Active)'}
            >
              {micEnabled ? <Mic size={16} /> : <MicOff size={16} />}
            </button>

            <button
              onClick={toggleVideo}
              className={`p-2 rounded-full transition-all active:scale-95 ${videoEnabled ? 'bg-[#1877F2] text-white shadow-lg shadow-blue-500/30' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
              title={videoEnabled ? 'Turn Camera Off' : 'Turn Camera On (PiP)'}
            >
              {videoEnabled ? <Video size={16} /> : <VideoOff size={16} />}
            </button>

            {isHost && (
              <button
                onClick={() => {
                  const nextLocked = !isLocked;
                  setIsLocked(nextLocked);
                  isLockedRef.current = nextLocked;
                  broadcast({ type: 'LOCK_STATE', isLocked: nextLocked });
                  toast.info(nextLocked ? 'Controls locked for guests' : 'Controls unlocked for guests');
                }}
                className={`p-2 rounded-full transition-colors ${isLocked ? 'bg-yellow-500 text-black' : 'bg-white/10 text-white'}`}
                title={isLocked ? 'Unlock controls for guests' : 'Lock controls for guests'}
              >
                {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
              </button>
            )}
          </div>
        </div>

        {/* Host YouTube Input row (Compact) */}
        {isHost && !isCompactViewport && (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Paste YouTube Link or Video ID to play..."
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSetVideo()}
              className="flex-1 bg-black border border-gray-700 rounded-xl px-3 py-1.5 text-xs sm:text-sm focus:border-[#1877F2] outline-none text-white"
            />
            <button onClick={handleSetVideo} className="bg-[#1877F2] hover:bg-blue-600 px-3.5 rounded-xl text-white font-bold text-xs sm:text-sm transition-colors">
              Play
            </button>
          </div>
        )}
      </div>

      {/* 3. SCROLLABLE CHAT AREA ONLY (Newest/Recent messages strictly at TOP, older push DOWNWARD) */}
      <div
        id="cinema-chat-container"
        ref={chatContainerRef}
        className="flex-1 min-h-0 bg-black overflow-y-auto overscroll-contain p-3 sm:p-4 flex flex-col gap-2.5 scroll-smooth"
      >
        {chatMessages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-6 opacity-50">
            <p className="text-xs text-gray-400">Live room chat — newest messages appear at the top</p>
          </div>
        ) : (
          chatMessages.filter(Boolean).map(msg => {
            const senderId = msg.sender?.id || '';
            const senderName = msg.sender?.name || 'User';
            const senderAvatar = msg.sender?.avatar || undefined;
            const isSenderMe = Boolean(senderId && currentUser?.id && senderId === currentUser.id);

            return (
              <div key={msg.id} className="flex items-start gap-2 max-w-[90%] fade-in slide-in-from-top-2 animate-in duration-200 relative group shrink-0">
                <ProfileAvatar userId={senderId} defaultAvatar={senderAvatar} name={senderName} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-gray-800 shrink-0 mt-0.5" />
                <div className="bg-gray-900 px-3.5 py-2 rounded-2xl rounded-tl-none border border-gray-800">
                  <p className="text-[11px] font-bold text-gray-400 mb-0.5">{senderName}</p>
                  {msg.text && <p className="text-sm text-gray-100 break-words">{msg.text}</p>}
                  {msg.imageUrl && (
                    <img src={msg.imageUrl} className="mt-2 rounded-xl max-w-full max-h-48 object-cover border border-gray-700" alt="Shared in chat" />
                  )}
                </div>
                {(isSenderMe || isHost) && (
                  <button onClick={() => deleteMessage(msg.id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-500 hover:text-red-500 transition-all self-center shrink-0">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 4. LOCKED BOTTOM INPUT BAR */}
      <div className="shrink-0 bg-gray-900 border-t border-gray-800 relative z-20">
        {typingUsers.size > 0 && (
          <div className="absolute -top-9 right-3 px-3 py-1 text-[11px] text-gray-300 italic bg-gray-900/95 backdrop-blur rounded-full flex items-center gap-1.5 border border-gray-700 shadow-xl z-50">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1877F2] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1877F2]"></span>
            </span>
            {Array.from(typingUsers).join(', ')} is typing...
          </div>
        )}

        {showEmojiPicker && (
          <div className="absolute bottom-14 right-3 bg-gray-800 border border-gray-700 rounded-2xl p-2.5 flex gap-2.5 shadow-2xl z-50 animate-in slide-in-from-bottom-2">
            {['❤️', '😂', '😮', '😢', '😡', '🔥', '👍', '👏'].map(emoji => (
              <button key={emoji} onClick={() => { sendReaction(emoji); setShowEmojiPicker(false); }} className="text-2xl hover:scale-125 transition-transform">
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div className="p-2 sm:p-2.5 flex items-center gap-2">
          <div className="flex-1 relative flex items-center">
            <input
              type="text"
              value={chatInput}
              onChange={e => handleChatInputChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="Type a message..."
              className="w-full bg-black border border-gray-700 rounded-full pl-4 pr-20 py-2 text-sm focus:border-white outline-none text-white"
            />
            <div className="absolute right-1.5 flex items-center gap-1">
              <label className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer" title="Send image">
                <ImageIcon size={17} />
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
              <button onClick={sendMessage} className="p-1.5 text-[#1877F2] bg-blue-500/10 rounded-full hover:bg-blue-500/20 transition-colors" title="Send message">
                <Send size={15} />
              </button>
            </div>
          </div>

          <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={`p-2 rounded-full transition-colors border border-gray-800 ${showEmojiPicker ? 'bg-gray-800 text-white' : 'bg-black text-gray-400 hover:text-white'}`}>
            <SmilePlus size={18} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes float-up {
          0% { transform: translateY(0) scale(0.5); opacity: 0; }
          20% { transform: translateY(-20px) scale(1.2); opacity: 1; }
          80% { transform: translateY(-80px) scale(1); opacity: 0.8; }
          100% { transform: translateY(-100px) scale(0.8); opacity: 0; }
        }
        .animate-float-up {
          animation: float-up 2s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

// Safe Error Boundary for Cinema to prevent white screen crashes
class CinemaErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Cinema] Caught unexpected rendering error in Cinema:', error, errorInfo);
    try {
      sessionStorage.removeItem(CINEMA_SESSION_KEY);
      sessionStorage.removeItem('active_room_code');
      sessionStorage.removeItem('active_room_type');
      sessionStorage.removeItem('active_room_is_host');
    } catch (_) {}
  }

  handleReset = () => {
    try {
      sessionStorage.removeItem(CINEMA_SESSION_KEY);
      sessionStorage.removeItem('active_room_code');
      sessionStorage.removeItem('active_room_type');
      sessionStorage.removeItem('active_room_is_host');
    } catch (_) {}
    this.setState({ hasError: false });
    window.location.href = '/cinema';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center bg-black text-white">
          <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mb-4">
            <Video size={32} />
          </div>
          <h2 className="text-xl font-bold mb-2">Cinema Session Reset</h2>
          <p className="text-gray-400 text-sm max-w-md mb-6">
            A temporary display error occurred. Your cinema session has been safely refreshed.
          </p>
          <button
            onClick={this.handleReset}
            className="px-6 py-2.5 bg-[#1877F2] text-white rounded-full font-bold hover:bg-blue-600 transition shadow-lg"
          >
            Return to Cinema Lobby
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const SafeCinema: React.FC = () => (
  <CinemaErrorBoundary>
    <Cinema />
  </CinemaErrorBoundary>
);

export default SafeCinema;
