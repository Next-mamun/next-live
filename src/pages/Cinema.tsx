import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import YouTube from 'react-youtube';
import { 
  Play, Pause, Volume2, Mic, MicOff, Video, VideoOff, 
  Users, Lock, Unlock, LogOut, Send, Trash2, StepForward, Image as ImageIcon, SmilePlus,
  X, Copy, Check, Loader2, Camera
} from 'lucide-react';
import { toast } from 'sonner';
import { VideoStreamPlayer } from '@/components/VideoStreamPlayer';
import { DraggablePip } from '@/components/DraggablePip';
import { RemoteAudioStream } from '@/components/RemoteAudioStream';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { getDynamicIceConfig, HD_AUDIO_CONSTRAINTS } from '@/lib/webrtcConfig';
import { useContentFilter } from '@/hooks/useContentFilter';

// Types
type Role = 'HOST' | 'GUEST';

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

interface PeerInfo {
  id: string;
  profile?: UserProfile;
  conn: DataConnection;
  role: Role;
  joinedAt: number;
  isSpeaking?: boolean;
  hasCamera?: boolean;
}

interface Participant {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
  isHost: boolean;
}

const STUN_URLS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];

const Cinema: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { scanFile } = useContentFilter();
  const [searchParams] = useSearchParams();
  const params = useParams();
  const urlRoomCode = searchParams.get('code') || params.id || '';
  const urlIsHost = searchParams.get('host') === 'true';

  const [view, setView] = useState<'ENTRY' | 'LOBBY' | 'ROOM'>('ENTRY');
  const [roomCode, setRoomCode] = useState(urlRoomCode);
  const [joinCode, setJoinCode] = useState(urlRoomCode);
  const [isHost, setIsHost] = useState(urlIsHost);
  const [isLocked, setIsLocked] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Player State
  const playerRef = useRef<any>(null);
  const [videoId, setVideoId] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [queueUrl, setQueueUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // P2P State
  const peerRef = useRef<Peer | null>(null);
  const [peers, setPeers] = useState<Record<string, PeerInfo>>({});
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [showParticipants, setShowParticipants] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Media Streams & Audio Ducking
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [micEnabled, setMicEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [activeCameraPeers, setActiveCameraPeers] = useState<Set<string>>(new Set());

  // Web Audio Context for ducking & keep-alive
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const duckingIntervalRef = useRef<any>(null);
  const pingIntervalRef = useRef<any>(null);
  const silentNodeRef = useRef<any>(null);

  // Typing & Emojis
  const typingTimerRef = useRef<any>(null);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: number; emoji: string; left: number }[]>([]);

  // Refs for callbacks
  const peersRef = useRef(peers);
  useEffect(() => { peersRef.current = peers; }, [peers]);

  const videoIdRef = useRef(videoId);
  useEffect(() => { videoIdRef.current = videoId; }, [videoId]);

  const queueUrlRef = useRef(queueUrl);
  useEffect(() => { queueUrlRef.current = queueUrl; }, [queueUrl]);

  const isHostRef = useRef(isHost);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  const roomCodeRef = useRef(roomCode);
  useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);

  const handleLeaveRoomRef = useRef<() => void>(() => {});

  // UNMOUNT CLEANUP: Ensure all media tracks, intervals, and peer connections are released when navigating away
  useEffect(() => {
    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (duckingIntervalRef.current) {
        clearInterval(duckingIntervalRef.current);
        duckingIntervalRef.current = null;
      }
      if (peerRef.current) {
        try { peerRef.current.destroy(); } catch (e) {}
        peerRef.current = null;
      }
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch (e) {}
        audioContextRef.current = null;
      }
      if (localStream) {
        try { localStream.getTracks().forEach(track => track.stop()); } catch (e) {}
      }
      if ((window as any).cinemaLocalStream) {
        try { (window as any).cinemaLocalStream.getTracks().forEach((t: MediaStreamTrack) => t.stop()); } catch (e) {}
        (window as any).cinemaLocalStream = null;
      }
      // Clean up session storage so navigating away from Cinema leaves a fresh state
      try {
        sessionStorage.removeItem('active_room_code');
        sessionStorage.removeItem('active_room_type');
        sessionStorage.removeItem('active_room_is_host');
      } catch (e) {}
    };
  }, []);

  const lastSyncStateRef = useRef<{ time: number; state: 'PLAYING' | 'PAUSED'; videoId: string } | null>(null);

  const extractVideoId = (url: string) => {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
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

        // Create silent oscillator to keep iOS/Android audio session active
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001; // virtually silent
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        silentNodeRef.current = osc;
      } catch (e) {
        console.warn('AudioContext init warning:', e);
      }
    }
  };

  // --------------------------------------------------------------------------
  // AUDIO DUCKING (Voice over Movie)
  // When any remote or local voice track is active, lower movie volume to 0.1 (10%)
  // When mics are muted/silent, restore volume to 1.0 (100%)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const checkVoiceActivity = () => {
      const anySpeaking = isLocalSpeaking || 
        Object.values(peersRef.current).some(p => p.isSpeaking) ||
        micEnabled;

      if (playerRef.current && typeof playerRef.current.setVolume === 'function') {
        try {
          if (anySpeaking) {
            // Duck movie audio to 10%
            playerRef.current.setVolume(10);
          } else {
            // Restore movie audio to 100%
            playerRef.current.setVolume(100);
          }
        } catch (e) {}
      }
    };

    duckingIntervalRef.current = setInterval(checkVoiceActivity, 400);
    return () => {
      if (duckingIntervalRef.current) clearInterval(duckingIntervalRef.current);
    };
  }, [isLocalSpeaking, micEnabled]);

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

      const checkLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const speaking = avg > 18; // Audio threshold
        setIsLocalSpeaking(speaking);

        // Broadcast speaking state
        broadcast({ type: 'SPEAKING_STATE', isSpeaking: speaking });

        animFrame = requestAnimationFrame(checkLevel);
      };

      checkLevel();
      return () => {
        cancelAnimationFrame(animFrame);
        try { source.disconnect(); } catch (e) {}
      };
    } catch (e) {
      console.warn('Voice activity error:', e);
    }
  }, [localStream, micEnabled]);

  // --------------------------------------------------------------------------
  // BROADCAST HELPER
  // --------------------------------------------------------------------------
  const broadcast = useCallback((data: any) => {
    Object.values(peersRef.current).forEach(p => {
      if (p.conn && p.conn.open) {
        try {
          p.conn.send(data);
        } catch (e) {
          console.warn('Broadcast error:', e);
        }
      }
    });
  }, []);

  // --------------------------------------------------------------------------
  // MODULE 1: PREDICTABLE DIRECT MATCHMAKING & HOST RECOVERY
  // --------------------------------------------------------------------------
  const getHostPeerId = (code: string) => `next-room-${code.trim().toLowerCase()}`;
  const getGuestPeerId = (code: string) => `next-room-${code.trim().toLowerCase()}-guest-${Math.random().toString(36).slice(2, 8)}`;

  const initPeerJS = (activeCode: string, hostMode: boolean) => {
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (e) {}
      peerRef.current = null;
    }

    initAudioContext();
    const cleanCode = activeCode.trim().toUpperCase();
    const targetPeerId = hostMode ? getHostPeerId(cleanCode) : getGuestPeerId(cleanCode);

    console.log(`[Cinema] Initializing PeerJS: ${targetPeerId} (Host: ${hostMode})`);

    const peer = new Peer(targetPeerId, {
      config: getDynamicIceConfig()
    });

    peer.on('open', (id) => {
      console.log('[Cinema] Peer open with ID:', id);
      setIsConnecting(false);

      if (!hostMode) {
        // MODULE 1: User B Instant Direct Connect (no waiting UI)
        connectToHost(peer, cleanCode);
      } else {
        // MODULE 1: Host Re-join Logic -> pull sync state from any already connected peers
        broadcast({ type: 'GET_SYNC_STATE' });
      }

      // Start keep-alive ping every 2500ms
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        broadcast({ type: 'PING', timestamp: Date.now() });
      }, 2500);
    });

    peer.on('connection', (conn) => {
      setupDataConnection(conn, hostMode, cleanCode);
    });

    peer.on('call', (call) => {
      // Answer incoming media call with local stream if available
      const currentStream = (window as any).cinemaLocalStream;
      call.answer(currentStream || undefined);

      call.on('stream', (remoteMediaStream) => {
        try {
          if (remoteMediaStream) {
            setRemoteStreams(prev => ({ ...prev, [call.peer]: remoteMediaStream }));
            
            // Safe check if stream has video track
            const tracks = remoteMediaStream.getVideoTracks ? remoteMediaStream.getVideoTracks() : [];
            if (tracks && tracks.length > 0 && tracks[0]?.enabled) {
              setActiveCameraPeers(prev => new Set(prev).add(call.peer));
            }
          }
        } catch (e) {
          console.warn('[Cinema] Error handling incoming media stream:', e);
        }
      });
    });

    let hostRetryCount = 0;
    const maxHostRetries = 2;
    let guestRetryCount = 0;
    const maxGuestRetries = 3;

    peer.on('error', (err: any) => {
      const errType = err?.type;
      if (errType === 'unavailable-id' && hostMode) {
        if (hostRetryCount < maxHostRetries) {
          hostRetryCount++;
          console.warn(`[Cinema] Host ID occupied, retrying reclaim (${hostRetryCount}/${maxHostRetries}) in 2s...`);
          setTimeout(() => {
            if (peerRef.current && !peerRef.current.destroyed) {
              try { peerRef.current.destroy(); } catch (e) {}
              peerRef.current = null;
              initPeerJS(cleanCode, true);
            }
          }, 2000);
        } else {
          setIsConnecting(false);
          console.warn('[Cinema] Host ID occupied and cannot be reclaimed:', cleanCode);
          toast.error(`Room #${cleanCode} was recently active or busy. Returning to lobby.`);
          handleLeaveRoomRef.current();
        }
      } else if (errType === 'peer-unavailable' && !hostMode) {
        if (guestRetryCount < maxGuestRetries) {
          guestRetryCount++;
          console.warn(`[Cinema] Host not reached yet (attempt ${guestRetryCount}/${maxGuestRetries}), retrying in 2s...`);
          setTimeout(() => {
            if (peerRef.current && !peerRef.current.destroyed) {
              connectToHost(peerRef.current, cleanCode);
            }
          }, 2000);
        } else {
          setIsConnecting(false);
          console.warn('[Cinema] Host offline or room does not exist:', cleanCode);
          toast.error(`Room #${cleanCode} host is currently offline.`);
          handleLeaveRoomRef.current();
        }
      } else {
        setIsConnecting(false);
        console.warn('[Cinema] Peer notice:', err?.message || err);
      }
    });

    peerRef.current = peer;
  };

  useEffect(() => {
    if (urlRoomCode) {
      let code = urlRoomCode.trim().toUpperCase();
      if (/^\d{4}$/.test(code)) code = `C${code}`;
      setRoomCode(code);
      setJoinCode(code);
      if (urlIsHost) {
        setIsHost(true);
        isHostRef.current = true;
        initPeerJS(code, true);
        setView('LOBBY');
      } else {
        setIsHost(false);
        isHostRef.current = false;
        initPeerJS(code, false);
      }
    }
  }, [urlRoomCode, urlIsHost]);

  const connectToHost = (peer: Peer, cleanCode: string) => {
    if (!peer || peer.destroyed) return;
    const hostId = getHostPeerId(cleanCode);
    const conn = peer.connect(hostId, { reliable: true });
    setupDataConnection(conn, false, cleanCode);
  };

  const setupDataConnection = (conn: DataConnection, hostMode: boolean, cleanCode: string) => {
    conn.on('open', () => {
      console.log(`[Cinema] Data connection opened with: ${conn.peer}`);
      setIsConnecting(false);

      // Send identity handshake immediately
      if (currentUser) {
        conn.send({
          type: 'PEER_IDENTITY',
          user: {
            id: currentUser.id,
            name: currentUser.display_name,
            username: currentUser.username,
            avatar: currentUser.avatar_url
          }
        });
      }

      setPeers(prev => ({
        ...prev,
        [conn.peer]: {
          id: conn.peer,
          conn,
          role: conn.peer === getHostPeerId(cleanCode) ? 'HOST' : 'GUEST',
          joinedAt: Date.now()
        }
      }));

      // If localStream is already active (mic or camera), immediately call this new peer
      const currentStream = (window as any).cinemaLocalStream;
      if (currentStream && peerRef.current) {
        try {
          peerRef.current.call(conn.peer, currentStream);
        } catch (e) {
          console.warn('Auto call peer error:', e);
        }
      }

      if (!hostMode) {
        // MODULE 1: Instant Direct Connect -> Mount active Cinema environment directly
        enterRoom(cleanCode, false);
        toast.success('Connected to Cinema Hall!');
      } else {
        // Host immediately pushes video state to new guest
        if (videoIdRef.current) {
          const currentTime = playerRef.current?.getCurrentTime ? playerRef.current.getCurrentTime() : 0;
          const playerState = playerRef.current?.getPlayerState ? playerRef.current.getPlayerState() : 1;
          conn.send({
            type: 'SYNC_STATE',
            time: currentTime,
            state: playerState === 1 ? 'PLAYING' : 'PAUSED',
            videoId: videoIdRef.current,
            queueUrl: queueUrlRef.current
          });
        }
      }
    });

    conn.on('data', (data: any) => {
      handlePeerData(data, conn.peer);
    });

    conn.on('close', () => {
      handlePeerDisconnect(conn.peer);
    });

    conn.on('error', () => {
      handlePeerDisconnect(conn.peer);
    });
  };

  const handlePeerDisconnect = (peerId: string) => {
    setPeers(prev => {
      const updated = { ...prev };
      delete updated[peerId];
      return updated;
    });
    setRemoteStreams(prev => {
      const updated = { ...prev };
      delete updated[peerId];
      return updated;
    });
    setActiveCameraPeers(prev => {
      const next = new Set(prev);
      next.delete(peerId);
      return next;
    });

    if (peerId === getHostPeerId(roomCodeRef.current) && !isHostRef.current) {
      toast.info('Host disconnected. Saving video state...');
    }
  };

  // --------------------------------------------------------------------------
  // PEER DATA HANDLER
  // --------------------------------------------------------------------------
  const handlePeerData = (data: any, peerId: string) => {
    switch (data.type) {
      case 'PING':
        try {
          peersRef.current[peerId]?.conn?.send({ type: 'PONG' });
        } catch (e) {}
        break;

      case 'PONG':
        break;

      case 'PEER_IDENTITY':
        // MODULE 2: Lobby Sync -> Admin sees User B immediately
        setPeers(prev => {
          const existing = prev[peerId];
          return {
            ...prev,
            [peerId]: {
              id: peerId,
              conn: existing?.conn || (data as any),
              role: peerId === getHostPeerId(roomCodeRef.current) ? 'HOST' : 'GUEST',
              joinedAt: existing?.joinedAt || Date.now(),
              profile: data.user
            }
          };
        });
        break;

      case 'SYNC_PARTICIPANTS':
        if (!isHostRef.current && Array.isArray(data.participants)) {
          setParticipants(data.participants);
        }
        break;

      case 'GET_SYNC_STATE':
        // Connected peer replies with current timestamp to resuming host
        if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function' && videoIdRef.current) {
          const t = playerRef.current.getCurrentTime();
          const s = playerRef.current.getPlayerState();
          peersRef.current[peerId]?.conn?.send({
            type: 'SYNC_STATE_RESPONSE',
            time: t || 0,
            state: s === 1 ? 'PLAYING' : 'PAUSED',
            videoId: videoIdRef.current,
            queueUrl: queueUrlRef.current
          });
        }
        break;

      case 'SYNC_STATE_RESPONSE':
        // Host re-claim recovery: pulls current video timestamp
        if (isHostRef.current && data.videoId) {
          setVideoId(data.videoId);
          videoIdRef.current = data.videoId;
          if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
            playerRef.current.seekTo(data.time, true);
            if (data.state === 'PLAYING') {
              playerRef.current.playVideo();
              setIsPlaying(true);
            }
          }
          toast.success('Synced movie state from active viewers!');
        }
        break;

      case 'SYNC_STATE':
        if (!isHostRef.current) {
          lastSyncStateRef.current = { time: data.time, state: data.state, videoId: data.videoId };

          if (data.videoId && data.videoId !== videoIdRef.current) {
            setVideoId(data.videoId);
            videoIdRef.current = data.videoId;
          }
          if (data.queueUrl !== undefined && data.queueUrl !== queueUrlRef.current) {
            setQueueUrl(data.queueUrl);
            queueUrlRef.current = data.queueUrl;
          }

          if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
            const p = playerRef.current;
            const currentTime = p.getCurrentTime();
            const drift = Math.abs(currentTime - data.time);

            if (drift > 1.2) {
              p.seekTo(data.time, true);
            }

            const state = p.getPlayerState();
            if (data.state === 'PLAYING' && state !== 1 && state !== 3) {
              p.playVideo();
              setIsPlaying(true);
            } else if (data.state === 'PAUSED' && state !== 2) {
              p.pauseVideo();
              setIsPlaying(false);
            }
          }
        }
        break;

      case 'SPEAKING_STATE':
        setPeers(prev => {
          if (!prev[peerId]) return prev;
          return {
            ...prev,
            [peerId]: { ...prev[peerId], isSpeaking: Boolean(data.isSpeaking) }
          };
        });
        break;

      case 'CAMERA_STATE':
        // MODULE 2: Global PiP Camera -> unmount if camera disabled
        setActiveCameraPeers(prev => {
          const next = new Set(prev);
          if (data.enabled) next.add(peerId);
          else next.delete(peerId);
          return next;
        });
        break;

      case 'CHAT_MESSAGE':
        setChatMessages(prev => [data.message, ...prev]);
        break;

      case 'DELETE_MESSAGE':
        setChatMessages(prev => prev.filter(m => m.id !== data.messageId));
        break;

      case 'REACTION':
        showReaction(data.emoji);
        break;

      case 'TYPING':
        setTypingUsers(prev => {
          const next = new Set(prev);
          if (data.isTyping) next.add(data.user);
          else next.delete(data.user);
          return next;
        });
        break;

      case 'SEEN':
        window.dispatchEvent(new CustomEvent('P2P_SIGNAL', { detail: { data, peerId } }));
        break;
    }
  };

  // --------------------------------------------------------------------------
  // PARTICIPANT SYNC & LOBBY SYNC
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (isHost && currentUser) {
      const hostUser: Participant = { 
        id: currentUser.id, 
        name: currentUser.display_name || (currentUser as any)?.name || currentUser.username || (currentUser as any)?.email?.split('@')[0] || 'Host', 
        username: currentUser.username || '',
        avatar: currentUser.avatar_url || '',
        isHost: true 
      };

      const guestUsers: Participant[] = Object.values(peers).map(p => ({
        id: p.profile?.id || p.id,
        name: p.profile?.name || 'Guest',
        username: p.profile?.username || '',
        avatar: p.profile?.avatar || '',
        isHost: false
      }));

      const uniqueMap = new Map<string, Participant>();
      [hostUser, ...guestUsers].forEach(item => {
        if (item?.id && !uniqueMap.has(item.id)) {
          uniqueMap.set(item.id, item);
        }
      });

      const allParticipants = Array.from(uniqueMap.values());
      setParticipants(allParticipants);
      broadcast({ type: 'SYNC_PARTICIPANTS', participants: allParticipants });
    } else if (!isHost && currentUser && participants.length === 0) {
      setParticipants([
        { 
          id: currentUser.id, 
          name: currentUser.display_name || (currentUser as any)?.name || currentUser.username || (currentUser as any)?.email?.split('@')[0] || 'Guest', 
          username: currentUser.username || '', 
          avatar: currentUser.avatar_url || '', 
          isHost: false 
        }
      ]);
    }
  }, [peers, isHost, currentUser, broadcast]);

  // --------------------------------------------------------------------------
  // PAGE REHYDRATION (Module 1.4: Persistence from sessionStorage)
  // --------------------------------------------------------------------------
  useEffect(() => {
    try {
      const savedCode = sessionStorage.getItem('active_room_code');
      const savedType = sessionStorage.getItem('active_room_type');
      const savedHost = sessionStorage.getItem('active_room_is_host') === 'true';

      const isValidCode = Boolean(
        savedCode && 
        typeof savedCode === 'string' && 
        savedCode.trim().length >= 4 && 
        savedCode !== 'null' && 
        savedCode !== 'undefined'
      );

      if (isValidCode && savedType === 'cinema' && view === 'ENTRY') {
        const cleanCode = savedCode!.trim().toUpperCase();
        console.log(`[Cinema] Safely rehydrating room state from sessionStorage: ${cleanCode}`);
        setRoomCode(cleanCode);
        setIsHost(savedHost);
        isHostRef.current = savedHost;
        enterRoom(cleanCode, savedHost);
      } else if (savedType === 'cinema' && !isValidCode) {
        sessionStorage.removeItem('active_room_code');
        sessionStorage.removeItem('active_room_type');
        sessionStorage.removeItem('active_room_is_host');
      }
    } catch (err) {
      console.warn('[Cinema] Error during room rehydration, clearing stale session:', err);
      try {
        sessionStorage.removeItem('active_room_code');
        sessionStorage.removeItem('active_room_type');
        sessionStorage.removeItem('active_room_is_host');
      } catch (e) {}
      setView('ENTRY');
    }
  }, []);

  // --------------------------------------------------------------------------
  // ROOM ENTRY & EXIT HANDLERS
  // --------------------------------------------------------------------------
  const enterRoom = (code: string, hostMode = isHost) => {
    initAudioContext();
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode) return;

    sessionStorage.setItem('active_room_code', cleanCode);
    sessionStorage.setItem('active_room_type', 'cinema');
    sessionStorage.setItem('active_room_is_host', String(hostMode));

    if (hostMode && inputUrl.trim()) {
      const id = extractVideoId(inputUrl);
      if (id) {
        setVideoId(id);
        videoIdRef.current = id;
      }
      setInputUrl('');
    }

    if (!peerRef.current) {
      initPeerJS(cleanCode, hostMode);
    }

    setView('ROOM');
  };

  // MODULE 4: Surgical Cleanup (STRICT DATA BAN - DO NOT TOUCH DEXIE OR FIREBASE)
  const handleLeaveRoom = () => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (duckingIntervalRef.current) {
      clearInterval(duckingIntervalRef.current);
      duckingIntervalRef.current = null;
    }

    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (e) {}
      peerRef.current = null;
    }

    if (localStream) {
      try { localStream.getTracks().forEach(track => track.stop()); } catch (e) {}
      setLocalStream(null);
    }
    if ((window as any).cinemaLocalStream) {
      try { (window as any).cinemaLocalStream.getTracks().forEach((t: MediaStreamTrack) => t.stop()); } catch (e) {}
      (window as any).cinemaLocalStream = null;
    }

    try {
      sessionStorage.removeItem('active_room_code');
      sessionStorage.removeItem('active_room_type');
      sessionStorage.removeItem('active_room_is_host');
    } catch (e) {}

    setPeers({});
    setParticipants([]);
    setChatMessages([]);
    setRemoteStreams({});
    setActiveCameraPeers(new Set());
    setVideoId('');
    videoIdRef.current = '';
    setQueueUrl('');
    setMicEnabled(false);
    setVideoEnabled(false);
    setIsLocalSpeaking(false);
    setView('ENTRY');

    toast.info('Left the Cinema Hall');
  };

  useEffect(() => {
    handleLeaveRoomRef.current = handleLeaveRoom;
  });

  // --------------------------------------------------------------------------
  // CREATION & JOINING INITIATION
  // --------------------------------------------------------------------------
  const handleCreateTheatre = () => {
    setIsConnecting(true);
    const randomDigits = Math.floor(1000 + Math.random() * 9000).toString();
    const code = `C${randomDigits}`; // Exact format requested: C + 4 random digits (e.g. C2838)
    setRoomCode(code);
    setIsHost(true);
    isHostRef.current = true;
    initPeerJS(code, true);
    setView('LOBBY');
  };

  const handleJoinTheatre = () => {
    if (!joinCode.trim()) {
      toast.error('Please enter a room code');
      return;
    }
    let code = joinCode.trim().toUpperCase();

    // If pure 4 digits entered, assume Cinema code (e.g. 2838 -> C2838)
    if (/^\d{4}$/.test(code)) {
      code = `C${code}`;
    }

    if (code.startsWith('M') || code.startsWith('MET-')) {
      navigate(`/meet?code=${code}`);
      return;
    }

    // Aggressively set connecting state and retry
    setIsConnecting(true);
    setRoomCode(code);
    setIsHost(false);
    isHostRef.current = false;
    
    // Reset Peer if trying to rejoin repeatedly
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (e) {}
      peerRef.current = null;
    }
    
    initPeerJS(code, false);
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
      callAllPeers(masterStream);
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

  const callAllPeers = (stream: MediaStream) => {
    if (!peerRef.current) return;
    Object.values(peersRef.current).forEach(p => {
      peerRef.current!.call(p.id, stream);
    });
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
            queueUrl: queueUrlRef.current
          });
        }
      }, 2000);
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
        queueUrl: queueUrlRef.current
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
          queueUrl: queueUrlRef.current
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
      id: Date.now().toString(),
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
    setChatMessages(prev => [msg, ...prev]);
    setChatInput('');
    broadcast({ type: 'TYPING', isTyping: false, user: currentUser.display_name });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const inputEl = e.target;
    if (!file || !currentUser) return;

    // Ultra-strict AI Content Scanning for Cinema Chat
    const isSafe = await scanFile(file, inputEl);
    if (!isSafe) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const msg: ChatMessage = {
        id: Date.now().toString(),
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
      setChatMessages(prev => [msg, ...prev]);
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

  const showReaction = (emoji: string) => {
    const id = Date.now() + Math.random();
    const left = Math.floor(Math.random() * 80) + 10;
    setFloatingEmojis(prev => [...prev, { id, emoji, left }]);
    setTimeout(() => {
      setFloatingEmojis(prev => prev.filter(e => e.id !== id));
    }, 2000);
  };

  // --------------------------------------------------------------------------
  // VIEW: ENTRY
  // --------------------------------------------------------------------------
  if (view === 'ENTRY') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full w-full p-4 bg-gray-50 dark:bg-black">
        <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-xl border border-gray-100 dark:border-gray-800">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Cinema & Meet</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Watch YouTube together with synced audio & live video chat</p>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  const code = `M${randomDigits}`; // Exact format requested: M + 4 random digits (e.g. M3737)
                  navigate(`/meet?code=${code}&host=true`);
                }}
                className="bg-[#25D366] text-white rounded-2xl py-3.5 px-3 font-bold text-sm hover:bg-green-600 transition-all active:scale-95 shadow-lg shadow-green-500/30 flex flex-col items-center gap-1.5"
              >
                <Users size={24} />
                <span>Create Meet</span>
              </button>
              <button 
                onClick={() => navigate('/camera')}
                className="bg-gradient-to-tr from-pink-500 to-rose-500 text-white rounded-2xl py-3.5 px-3 font-bold text-sm hover:opacity-95 transition-all active:scale-95 shadow-lg shadow-pink-500/30 flex flex-col items-center gap-1.5"
                title="Open AR Camera Filters"
              >
                <Camera size={24} />
                <span>AR Filters</span>
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
  // VIEW: LOBBY (Host Only - Shows connected guests in real-time)
  // --------------------------------------------------------------------------
  if (view === 'LOBBY') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full w-full p-4 bg-black text-white">
        <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="bg-gray-900 border border-gray-800 p-8 rounded-3xl shadow-2xl">
            <h2 className="text-2xl font-bold mb-2">Cinema Room Code</h2>
            <div className="flex items-center justify-between text-3xl font-black text-[#1877F2] tracking-widest bg-black py-4 px-6 rounded-xl border border-blue-900/30">
              <span>{roomCode}</span>
              <button onClick={() => {
                navigator.clipboard.writeText(roomCode);
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
                toast.success('Code copied to clipboard!');
              }} className="text-gray-400 hover:text-white transition-colors">
                {isCopied ? <Check size={28} className="text-blue-500" /> : <Copy size={28} />}
              </button>
            </div>
            <p className="text-gray-400 mt-4 text-sm">Share this code. Friends will connect instantly to your room.</p>

            {/* MODULE 2: Real-time Lobby Sync of connected guests */}
            <div className="mt-6 pt-6 border-t border-gray-800">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Connected Friends in Lobby</h4>
              <div className="flex flex-wrap gap-2 justify-center">
                {participants.map(p => (
                  <div key={p.id} className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full border border-gray-800 animate-in zoom-in-95">
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
              className="w-full bg-gray-900 border border-gray-700 rounded-2xl py-4 px-4 text-center font-medium text-white focus:border-[#1877F2] focus:ring-1 focus:ring-[#1877F2] mb-4 outline-none"
            />
          </div>

          <button 
            onClick={() => enterRoom(roomCode, true)}
            className="w-full bg-white text-black rounded-2xl py-5 font-black text-xl hover:bg-gray-200 transition-transform active:scale-95 shadow-2xl shadow-white/10"
          >
            Start Cinema Session ▶
          </button>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // VIEW: ROOM (Active Cinema Theater)
  // --------------------------------------------------------------------------
  return (
    <div className="flex flex-col flex-1 h-full w-full bg-black text-white overflow-hidden relative">
      
      {/* Background Remote Audio Streams - Ensures voice is heard uninterrupted even if camera is turned off */}
      {Object.entries(remoteStreams).map(([peerId, stream]) => (
        <RemoteAudioStream key={`audio-${peerId}`} stream={stream} isMuted={false} />
      ))}

      {/* MODULE 2: Global Draggable PiP Cameras */}
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
        const p = peers[peerId];
        const tracks = stream?.getVideoTracks ? stream.getVideoTracks() : [];
        const isCameraOn = activeCameraPeers.has(peerId) || Boolean(tracks && tracks.length > 0 && tracks[0]?.enabled);
        
        // If PiP is disabled, we MUST still render a hidden video element to play the incoming audio track
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
            name={p?.profile?.name || 'Guest'}
            avatar={p?.profile?.avatar}
            isLocal={false}
            isMuted={false}
            isSpeaking={p?.isSpeaking}
            initialPosition={{ x: (typeof window !== 'undefined' ? window.innerWidth : 360) - 160, y: 70 + idx * 160 }}
          />
        );
      })}

      {/* HEADER OVERLAY */}
      <div className="absolute top-0 left-0 right-0 h-14 bg-gradient-to-b from-black/90 to-transparent z-40 flex items-center justify-between px-4 pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <span className="font-black bg-black/70 backdrop-blur px-3 py-1.5 rounded-full text-sm border border-white/10">#{roomCode}</span>
          {isHost && <span className="bg-[#1877F2] text-xs font-bold px-2.5 py-1 rounded-full">HOST</span>}
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <button 
            onClick={() => setShowParticipants(true)}
            className="flex items-center gap-1.5 text-sm font-bold bg-black/70 backdrop-blur px-3.5 py-1.5 rounded-full border border-white/10 cursor-pointer hover:bg-white/20 transition-colors"
            title="Click to view all participants"
          >
            <Users size={16} className="text-[#1877F2]" />
            <span>{participants.length > 0 ? participants.length : (Object.keys(peers).length + 1)}</span>
          </button>
          
          <button 
            onClick={() => navigate('/camera')}
            className="flex items-center gap-1.5 text-xs font-bold bg-pink-600/80 backdrop-blur px-3 py-1.5 rounded-full border border-pink-400/30 cursor-pointer hover:bg-pink-600 transition-colors text-white"
            title="AR Camera Filters"
          >
            <Camera size={15} />
            <span className="hidden sm:inline">AR Filters</span>
          </button>
          
          <button onClick={handleLeaveRoom} className="p-2 bg-black/70 backdrop-blur hover:bg-red-500/20 text-white hover:text-red-500 rounded-full transition-colors border border-white/10" title="Leave Room">
            <LogOut size={16} />
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
                  Participants ({participants.length > 0 ? participants.length : 1})
                </h3>
                <p className="text-xs text-gray-400">Room: #{roomCode}</p>
              </div>
              <button onClick={() => setShowParticipants(false)} className="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="max-h-72 overflow-y-auto p-3 space-y-2">
              {participants.filter(Boolean).map((p, i) => (
                <div key={p.id || String(i)} className="flex items-center justify-between p-3 rounded-2xl bg-black/50 border border-gray-800/80 hover:border-gray-700 transition-colors">
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
                      <p className="text-[11px] text-gray-400 truncate">ID: {p.id || 'N/A'}</p>
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
          style={{ left: `${e.left}%`, bottom: '40%' }}
        >
          {e.emoji}
        </div>
      ))}

      {/* 1. YOUTUBE PLAYER CONTAINER (TOP) */}
      <div className="w-full shrink-0 relative bg-black flex items-center justify-center border-b border-gray-800" style={{ height: '36vh' }}>
        {!videoId ? (
          <div className="text-center p-8 bg-gray-900/60 rounded-3xl border border-white/10 w-11/12 max-w-md shadow-xl">
            <Video size={44} className="mx-auto text-gray-600 mb-3 animate-pulse" />
            <h3 className="text-lg font-bold text-gray-300">
              {isHost ? 'Paste a YouTube link below to start' : 'Waiting for Host to play a video...'}
            </h3>
            <p className="text-xs text-gray-500 mt-1">Both participants will watch together in exact synchronization</p>
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

      {/* 2. CUSTOM CONTROLS BAR */}
      <div className="shrink-0 bg-gray-950 border-b border-gray-800 p-2.5 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button onClick={togglePlay} className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-colors" title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause size={18} className="text-white" /> : <Play size={18} className="text-white" />}
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
                <StepForward size={18} />
              </button>
            )}
            <button onClick={cycleSpeed} className="px-3 py-1.5 bg-white/10 rounded-xl hover:bg-white/20 transition-colors font-bold text-xs text-white">
              {playbackSpeed}x
            </button>
          </div>
          
          <div className="flex gap-2">
            {/* Mic Toggle Button */}
            <button 
              onClick={toggleMic} 
              className={`p-2.5 rounded-full transition-all active:scale-95 ${micEnabled ? 'bg-green-600 text-white shadow-lg shadow-green-600/30' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
              title={micEnabled ? 'Mute Voice' : 'Unmute Voice (Audio Ducking Active)'}
            >
              {micEnabled ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            
            {/* Video Toggle Button */}
            <button 
              onClick={toggleVideo} 
              className={`p-2.5 rounded-full transition-all active:scale-95 ${videoEnabled ? 'bg-[#1877F2] text-white shadow-lg shadow-blue-500/30' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
              title={videoEnabled ? 'Turn Camera Off' : 'Turn Camera On (PiP)'}
            >
              {videoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
            
            {isHost && (
              <button 
                onClick={() => {
                  setIsLocked(!isLocked);
                  toast.info(!isLocked ? 'Controls locked for guests' : 'Controls unlocked for guests');
                }} 
                className={`p-2.5 rounded-full transition-colors ${isLocked ? 'bg-yellow-500 text-black' : 'bg-white/10 text-white'}`}
                title={isLocked ? 'Unlock controls for guests' : 'Lock controls for guests'}
              >
                {isLocked ? <Lock size={18} /> : <Unlock size={18} />}
              </button>
            )}
          </div>
        </div>

        {/* Host YouTube Input row */}
        {isHost && (
          <div className="flex gap-2 mt-1">
            <input 
              type="text" 
              placeholder="Paste YouTube Link or Video ID to play..." 
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSetVideo()}
              className="flex-1 bg-black border border-gray-700 rounded-xl px-4 py-2 text-sm focus:border-[#1877F2] outline-none text-white"
            />
            <button onClick={handleSetVideo} className="bg-[#1877F2] hover:bg-blue-600 px-4 rounded-xl text-white font-bold text-sm transition-colors">
              Play
            </button>
          </div>
        )}
      </div>

      {/* 3. CHAT AREA */}
      <div id="chat-container" className="flex-1 bg-black overflow-y-auto p-4 flex flex-col-reverse gap-3 scroll-smooth">
        {chatMessages.filter(Boolean).map(msg => {
          const senderId = msg.sender?.id || '';
          const senderName = msg.sender?.name || 'User';
          const senderAvatar = msg.sender?.avatar || undefined;
          const isSenderMe = Boolean(senderId && currentUser?.id && senderId === currentUser.id);

          return (
            <div key={msg.id} className="flex items-start gap-2 max-w-[85%] fade-in slide-in-from-bottom-2 animate-in duration-300 relative group">
              <ProfileAvatar userId={senderId} defaultAvatar={senderAvatar} name={senderName} className="w-8 h-8 rounded-full border border-gray-800 shrink-0 mt-1" />
              <div className="bg-gray-900 px-4 py-2.5 rounded-2xl rounded-tl-none border border-gray-800">
                <p className="text-[11px] font-bold text-gray-400 mb-0.5">{senderName}</p>
                {msg.text && <p className="text-sm text-gray-100 break-words">{msg.text}</p>}
                {msg.imageUrl && (
                  <img src={msg.imageUrl} className="mt-2 rounded-xl max-w-full max-h-48 object-cover border border-gray-700" alt="Shared in chat" />
                )}
              </div>
              {(isSenderMe || isHost) && (
                <button onClick={() => deleteMessage(msg.id)} className="opacity-0 group-hover:opacity-100 p-2 text-gray-500 hover:text-red-500 transition-all self-center shrink-0">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 4. BOTTOM BAR */}
      <div className="shrink-0 bg-gray-900 border-t border-gray-800 pb-safe relative">
        
        {/* Typing Indicator */}
        {typingUsers.size > 0 && (
          <div className="absolute -top-10 right-4 px-4 py-1.5 text-xs text-gray-300 italic bg-gray-900/90 backdrop-blur rounded-full flex items-center gap-2 border border-gray-700 shadow-xl z-50">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1877F2] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1877F2]"></span>
            </span>
            {Array.from(typingUsers).join(', ')} is typing...
          </div>
        )}

        {/* Emoji Picker Popover */}
        {showEmojiPicker && (
          <div className="absolute bottom-16 right-4 bg-gray-800 border border-gray-700 rounded-2xl p-3 flex gap-3 shadow-2xl z-50 animate-in slide-in-from-bottom-2">
            {['❤️', '😂', '😮', '😢', '😡', '🔥', '👍', '👏'].map(emoji => (
              <button key={emoji} onClick={() => { sendReaction(emoji); setShowEmojiPicker(false); }} className="text-2xl hover:scale-125 transition-transform">
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <div className="p-3 flex items-center gap-2">
          <div className="flex-1 relative flex items-center">
            <input 
              type="text" 
              value={chatInput}
              onChange={e => handleChatInputChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="Type a message..."
              className="w-full bg-black border border-gray-700 rounded-full pl-4 pr-24 py-2.5 text-sm focus:border-white outline-none text-white"
            />
            <div className="absolute right-1 top-1 flex items-center gap-1">
              <label className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer" title="Send image">
                <ImageIcon size={18} />
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
              <button onClick={sendMessage} className="p-1.5 text-[#1877F2] bg-blue-500/10 rounded-full hover:bg-blue-500/20 transition-colors" title="Send message">
                <Send size={16} />
              </button>
            </div>
          </div>
          
          <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={`p-2.5 rounded-full transition-colors border border-gray-800 ${showEmojiPicker ? 'bg-gray-800 text-white' : 'bg-black text-gray-400 hover:text-white'}`}>
            <SmilePlus size={20} />
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
        .pb-safe {
          padding-bottom: env(safe-area-inset-bottom);
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
      sessionStorage.removeItem('active_room_code');
      sessionStorage.removeItem('active_room_type');
      sessionStorage.removeItem('active_room_is_host');
    } catch (e) {}
  }

  handleReset = () => {
    try {
      sessionStorage.removeItem('active_room_code');
      sessionStorage.removeItem('active_room_type');
      sessionStorage.removeItem('active_room_is_host');
    } catch (e) {}
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
