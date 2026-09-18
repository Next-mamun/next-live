import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { 
  Mic, MicOff, Video, VideoOff, 
  Users, LogOut, Send, Trash2, Image as ImageIcon,
  Phone, PhoneOff, Square, Copy, Check, Eye,
  X, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { VideoStreamPlayer } from '@/components/VideoStreamPlayer';
import { RemoteAudioStream } from '@/components/RemoteAudioStream';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { getDynamicIceConfig, HD_AUDIO_CONSTRAINTS } from '@/lib/webrtcConfig';
import { useContentFilter } from '@/hooks/useContentFilter';

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
  audioUrl?: string;
  type: 'TEXT' | 'IMAGE' | 'VOICE';
  isViewOnce?: boolean;
}

interface PeerInfo {
  id: string;
  profile?: UserProfile;
  conn: DataConnection;
  joinedAt: number;
  isTyping?: boolean;
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

const Meet: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { scanFile } = useContentFilter();
  const [searchParams] = useSearchParams();
  const params = useParams();
  const urlRoomCode = searchParams.get('code') || params.id || '';
  const urlIsHost = searchParams.get('host') === 'true';

  const [roomCode, setRoomCode] = useState(urlRoomCode);
  const [isHost, setIsHost] = useState(urlIsHost);
  const [view, setView] = useState<'LOBBY' | 'ROOM'>(urlIsHost ? 'LOBBY' : 'ROOM');
  const [isCopied, setIsCopied] = useState(false);

  // P2P State
  const peerRef = useRef<Peer | null>(null);
  const [peers, setPeers] = useState<Record<string, PeerInfo>>({});
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [showParticipants, setShowParticipants] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  
  // Media Streams for calls (HD Audio constraints enforced)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [callType, setCallType] = useState<'AUDIO' | 'VIDEO' | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ callerId: string; callerName: string; callType: 'AUDIO' | 'VIDEO'; profile?: UserProfile } | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const callTimerRef = useRef<any>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);

  // Voice Recording UX
  const [recordState, setRecordState] = useState<'IDLE' | 'RECORDING' | 'PREVIEW'>('IDLE');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const recordingTimerRef = useRef<any>(null);

  // Image Preview & View Once
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [isViewOnce, setIsViewOnce] = useState(false);
  const [viewedMessages, setViewedMessages] = useState<Set<string>>(new Set());
  const [viewingOnceMedia, setViewingOnceMedia] = useState<ChatMessage | null>(null);

  // Keep-alive & Background timers
  const pingIntervalRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Refs for callbacks
  const amIInCallRef = useRef(false);
  const peersRef = useRef(peers);
  useEffect(() => { peersRef.current = peers; }, [peers]);
  const isHostRef = useRef(isHost);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  const roomCodeRef = useRef(roomCode);
  useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);

  // Audio Context Keep-Alive for Mobile
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
      } catch (e) {}
    }
  };

  useEffect(() => {
    try {
      ringtoneRef.current = new Audio('https://actions.google.com/sounds/v1/alarms/phone_ringing.ogg');
      ringtoneRef.current.loop = true;
    } catch (e) {
      console.warn('Audio ringtone warning:', e);
    }
  }, []);

  // --------------------------------------------------------------------------
  // BROADCAST HELPER
  // --------------------------------------------------------------------------
  const broadcast = useCallback((data: any) => {
    Object.values(peersRef.current).forEach(p => {
      if (p.conn && p.conn.open) {
        try {
          p.conn.send(data);
        } catch (e) {
          console.warn('Meet broadcast error:', e);
        }
      }
    });
  }, []);

  // --------------------------------------------------------------------------
  // MODULE 1: PREDICTABLE DIRECT MATCHMAKING & RECONNECT
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

    console.log(`[Meet] Initializing PeerJS: ${targetPeerId} (Host: ${hostMode})`);

    const peer = new Peer(targetPeerId, {
      config: getDynamicIceConfig()
    });

    peer.on('open', (id) => {
      console.log('[Meet] Peer open with ID:', id);

      if (!hostMode) {
        // MODULE 1: User B Instant Direct Connect (no waiting UI)
        connectToHost(peer, cleanCode);
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
      if (amIInCallRef.current) {
        const stream = (window as any).meetLocalStream || localStream;
        call.answer(stream || undefined);
        call.on('stream', (userVideoStream) => {
          setRemoteStreams(prev => ({ ...prev, [call.peer]: userVideoStream }));
        });
      }
    });

    let retryCount = 0;
    const maxRetries = 3;

    peer.on('error', (err: any) => {
      const errType = err?.type;
      if (errType === 'unavailable-id' && hostMode) {
        console.warn('[Meet] Host ID occupied, retrying reclaim in 1.5s...');
        setTimeout(() => {
          if (peerRef.current && !peerRef.current.destroyed) {
            initPeerJS(cleanCode, true);
          }
        }, 1500);
      } else if (errType === 'peer-unavailable' && !hostMode) {
        if (retryCount < maxRetries) {
          retryCount++;
          console.warn(`[Meet] Host not reached yet (attempt ${retryCount}/${maxRetries}), retrying in 2s...`);
          setTimeout(() => {
            if (peerRef.current && !peerRef.current.destroyed) {
              connectToHost(peerRef.current, cleanCode);
            }
          }, 2000);
        } else {
          console.warn('[Meet] Host offline or room does not exist:', cleanCode);
          toast.error(`Meet #${cleanCode} host is currently offline. Please verify the code.`);
        }
      } else {
        console.warn('[Meet] Peer notice:', err?.message || err);
      }
    });

    peerRef.current = peer;
  };

  const connectToHost = (peer: Peer, cleanCode: string) => {
    if (!peer || peer.destroyed) return;
    const hostId = getHostPeerId(cleanCode);
    const conn = peer.connect(hostId, { reliable: true });
    setupDataConnection(conn, false, cleanCode);
  };

  const setupDataConnection = (conn: DataConnection, hostMode: boolean, cleanCode: string) => {
    conn.on('open', () => {
      console.log(`[Meet] Data connection opened with: ${conn.peer}`);

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
          joinedAt: Date.now(),
          isTyping: false
        }
      }));

      if (!hostMode) {
        // MODULE 1: Instant Direct Connect -> Mount active Meet environment directly
        setView('ROOM');
        sessionStorage.setItem('active_room_code', cleanCode);
        sessionStorage.setItem('active_room_type', 'meet');
        sessionStorage.setItem('active_room_is_host', 'false');
        toast.success('Joined Meet room!');
      }
    });

    conn.on('data', (data: any) => {
      handlePeerData(data, conn.peer);
    });

    conn.on('close', () => handlePeerDisconnect(conn.peer));
    conn.on('error', () => handlePeerDisconnect(conn.peer));
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
        setPeers(prev => {
          const existing = prev[peerId];
          return {
            ...prev,
            [peerId]: {
              id: peerId,
              conn: existing?.conn || (data as any),
              joinedAt: existing?.joinedAt || Date.now(),
              isTyping: false,
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

      case 'CHAT_MESSAGE':
        setChatMessages(prev => [...prev, data.message]);
        scrollToBottom();
        break;

      case 'TYPING':
        if (data.user) {
          window.dispatchEvent(new CustomEvent('P2P_SIGNAL', { detail: { data, peerId } }));
        }
        setPeers(prev => {
          if (!prev[peerId]) return prev;
          return { ...prev, [peerId]: { ...prev[peerId], isTyping: data.isTyping } };
        });
        break;

      case 'SEEN':
        window.dispatchEvent(new CustomEvent('P2P_SIGNAL', { detail: { data, peerId } }));
        break;

      case 'DELETE_MESSAGE':
        setChatMessages(prev => prev.filter(m => m.id !== data.messageId));
        break;

      case 'RINGING':
        if (!amIInCallRef.current) {
          setIncomingCall({ callerId: peerId, callerName: data.callerName, callType: data.callType, profile: data.profile });
          ringtoneRef.current?.play().catch(e => console.log('Audio ring error', e));
        }
        break;

      case 'CANCEL_RING':
        setIncomingCall(null);
        ringtoneRef.current?.pause();
        if (ringtoneRef.current) ringtoneRef.current.currentTime = 0;
        break;

      case 'JOINED_CALL':
        break;

      case 'MEDIA_VIEWED':
        setViewedMessages(prev => new Set(prev).add(data.messageId));
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
  // INITIALIZATION & REHYDRATION (Module 1.4)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const savedCode = sessionStorage.getItem('active_room_code');
    const savedType = sessionStorage.getItem('active_room_type');
    const savedHost = sessionStorage.getItem('active_room_is_host') === 'true';

    const effectiveCode = urlRoomCode || (savedType === 'meet' ? savedCode : '');
    const effectiveHost = urlRoomCode ? urlIsHost : savedHost;

    if (!effectiveCode) {
      navigate('/cinema');
      return;
    }

    setRoomCode(effectiveCode);
    setIsHost(effectiveHost);
    isHostRef.current = effectiveHost;

    sessionStorage.setItem('active_room_code', effectiveCode);
    sessionStorage.setItem('active_room_type', 'meet');
    sessionStorage.setItem('active_room_is_host', String(effectiveHost));

    initPeerJS(effectiveCode, effectiveHost);

    return () => {
      // Do not wipe DB data
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [urlRoomCode, urlIsHost]);

  const enterRoom = () => {
    setView('ROOM');
  };

  // MODULE 4: Surgical Cleanup (STRICT DATA BAN - DO NOT TOUCH DEXIE OR FIREBASE)
  const handleLeave = () => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    clearInterval(recordingTimerRef.current);
    clearInterval(callTimerRef.current);

    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (e) {}
      peerRef.current = null;
    }

    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      setLocalStream(null);
    }
    if ((window as any).meetLocalStream) {
      (window as any).meetLocalStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      (window as any).meetLocalStream = null;
    }

    sessionStorage.removeItem('active_room_code');
    sessionStorage.removeItem('active_room_type');
    sessionStorage.removeItem('active_room_is_host');

    setPeers({});
    setParticipants([]);
    setChatMessages([]);
    setRemoteStreams({});
    amIInCallRef.current = false;
    setCallType(null);

    toast.info('Left the Meet room');
    navigate('/cinema');
  };

  // --------------------------------------------------------------------------
  // MODULE 3: CALL ENGINE (HD AUDIO & ZERO FLICKERING)
  // --------------------------------------------------------------------------
  const getMediaStreamWithHDAudio = async (type: 'AUDIO' | 'VIDEO') => {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000
      },
      video: type === 'VIDEO'
    });
  };

  const startCall = async (type: 'AUDIO' | 'VIDEO') => {
    try {
      const stream = await getMediaStreamWithHDAudio(type);
      setLocalStream(stream);
      (window as any).meetLocalStream = stream;
      setCallType(type);
      setMicEnabled(true);
      setVideoEnabled(type === 'VIDEO');
      amIInCallRef.current = true;

      setCallDuration(0);
      clearInterval(callTimerRef.current);
      callTimerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000);

      broadcast({ type: 'RINGING', callerName: currentUser?.display_name || 'Someone', callType: type, profile: currentUser });

      Object.values(peersRef.current).forEach(p => {
        peerRef.current!.call(p.id, stream, { metadata: { type } });
      });
    } catch (err) {
      toast.error(type === 'VIDEO' ? 'Camera or Mic access denied.' : 'Mic access denied.');
    }
  };

  const endCall = () => {
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      setLocalStream(null);
    }
    if ((window as any).meetLocalStream) {
      (window as any).meetLocalStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      (window as any).meetLocalStream = null;
    }
    setRemoteStreams({});
    setCallType(null);
    amIInCallRef.current = false;
    clearInterval(callTimerRef.current);
    broadcast({ type: 'CANCEL_RING' });
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    ringtoneRef.current?.pause();
    const type = incomingCall.callType;
    setIncomingCall(null);

    try {
      const stream = await getMediaStreamWithHDAudio(type);
      setLocalStream(stream);
      (window as any).meetLocalStream = stream;
      setCallType(type);
      setMicEnabled(true);
      setVideoEnabled(type === 'VIDEO');
      amIInCallRef.current = true;

      setCallDuration(0);
      clearInterval(callTimerRef.current);
      callTimerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000);

      broadcast({ type: 'JOINED_CALL' });

      Object.values(peersRef.current).forEach(p => {
        peerRef.current!.call(p.id, stream, { metadata: { type } });
      });
    } catch (err) {
      toast.error('Media access denied.');
    }
  };

  const declineCall = () => {
    setIncomingCall(null);
    ringtoneRef.current?.pause();
  };

  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => { t.enabled = !micEnabled; });
    }
    setMicEnabled(!micEnabled);
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(t => { t.enabled = !videoEnabled; });
    }
    setVideoEnabled(!videoEnabled);
  };

  // --------------------------------------------------------------------------
  // CHAT & VOICE RECORDING
  // --------------------------------------------------------------------------
  const handleChatInputChange = (val: string) => {
    setChatInput(val);
    broadcast({ type: 'TYPING', isTyping: val.length > 0, user: currentUser?.display_name });
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      const anchor = document.getElementById('chat-bottom-anchor');
      if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });
    }, 100);
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
      timestamp: Date.now(),
      type: 'TEXT'
    };

    broadcast({ type: 'CHAT_MESSAGE', message: msg });
    setChatMessages(prev => [...prev, msg]);
    setChatInput('');
    broadcast({ type: 'TYPING', isTyping: false });
    scrollToBottom();
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const inputEl = e.target;
    if (!file) return;

    // Ultra-strict AI Content Scanning for Meet Chat
    const isSafe = await scanFile(file, inputEl);
    if (!isSafe) {
      setPreviewImageUrl(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreviewImageUrl(ev.target?.result as string);
      setIsViewOnce(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const cancelImagePreview = () => {
    setPreviewImageUrl(null);
    setIsViewOnce(false);
  };

  const sendImageMessage = () => {
    if (!previewImageUrl || !currentUser) return;
    const msg: ChatMessage = {
      id: Date.now().toString(),
      sender: {
        id: currentUser.id,
        name: currentUser.display_name,
        username: currentUser.username,
        avatar: currentUser.avatar_url
      },
      text: '',
      timestamp: Date.now(),
      imageUrl: previewImageUrl,
      type: 'IMAGE',
      isViewOnce
    };
    broadcast({ type: 'CHAT_MESSAGE', message: msg });
    setChatMessages(prev => [...prev, msg]);
    setPreviewImageUrl(null);
    setIsViewOnce(false);
    scrollToBottom();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          setPreviewAudioUrl(reader.result as string);
          setRecordState('PREVIEW');
          setIsViewOnce(false);
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setRecordState('RECORDING');
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      toast.error('Microphone access denied.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recordState === 'RECORDING') {
      mediaRecorderRef.current.stop();
      clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    setRecordState('IDLE');
    setPreviewAudioUrl(null);
    setRecordingDuration(0);
    setIsViewOnce(false);
  };

  const sendVoiceMessage = () => {
    if (!previewAudioUrl || !currentUser) return;
    const msg: ChatMessage = {
      id: Date.now().toString(),
      sender: {
        id: currentUser.id,
        name: currentUser.display_name,
        username: currentUser.username,
        avatar: currentUser.avatar_url
      },
      text: '',
      timestamp: Date.now(),
      audioUrl: previewAudioUrl,
      type: 'VOICE',
      isViewOnce
    };
    broadcast({ type: 'CHAT_MESSAGE', message: msg });
    setChatMessages(prev => [...prev, msg]);
    cancelRecording();
    scrollToBottom();
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const deleteMessage = (id: string) => {
    broadcast({ type: 'DELETE_MESSAGE', messageId: id });
    setChatMessages(prev => prev.filter(m => m.id !== id));
  };

  const handleOpenViewOnce = (msg: ChatMessage) => {
    setViewingOnceMedia(msg);
    setViewedMessages(prev => new Set(prev).add(msg.id));
    broadcast({ type: 'MEDIA_VIEWED', messageId: msg.id });
  };

  const closeViewOnce = () => {
    setViewingOnceMedia(null);
  };

  // --------------------------------------------------------------------------
  // VIEW: LOBBY (Host Only)
  // --------------------------------------------------------------------------
  if (view === 'LOBBY') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full w-full p-4 bg-black text-white">
        <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="bg-gray-900 border border-gray-800 p-8 rounded-3xl shadow-2xl">
            <h2 className="text-2xl font-bold mb-2">Meet Room Code</h2>
            <div className="flex items-center justify-between text-3xl font-black text-[#1877F2] tracking-widest bg-black py-4 px-6 rounded-xl border border-[#1877F2]/30">
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
            <p className="text-gray-400 mt-4 text-sm">Share this code with friends. They will join instantly.</p>

            {/* MODULE 2/3: Lobby Sync of Connected Participants */}
            <div className="mt-6 pt-6 border-t border-gray-800">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Connected in Lobby</h4>
              <div className="flex flex-wrap gap-2 justify-center">
                {participants.map(p => (
                  <div key={p.id} className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full border border-gray-800 animate-in zoom-in-95">
                    {p.avatar ? (
                      <ProfileAvatar userId={p.id} defaultAvatar={p.avatar} name={p.name} className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-green-600 text-xs flex items-center justify-center font-bold">
                        {((p?.name || 'U')[0] || 'U').toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs font-bold text-white">{p.name || 'Friend'}</span>
                    {p.isHost && <span className="text-[9px] bg-green-500/20 text-green-400 px-1 rounded">Host</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <button 
            onClick={enterRoom}
            className="w-full bg-[#1877F2] text-white rounded-2xl py-5 font-black text-xl hover:bg-blue-600 transition-transform active:scale-95 shadow-2xl shadow-blue-500/20"
          >
            Enter Meet Session
          </button>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // VIEW: ACTIVE MEET ROOM
  // --------------------------------------------------------------------------
  const remoteStreamEntries = Object.entries(remoteStreams);
  const totalCallUsers = (localStream ? 1 : 0) + remoteStreamEntries.length;
  const isOneOnOne = totalCallUsers === 2 && remoteStreamEntries.length === 1;

  return (
    <div className="flex flex-col flex-1 h-full w-full bg-black text-white overflow-hidden relative">
      
      {/* Background Remote Audio Streams - Ensures voice is heard uninterrupted even if video is disabled */}
      {remoteStreamEntries.map(([peerId, stream]) => (
        <RemoteAudioStream key={`meet-audio-${peerId}`} stream={stream} isMuted={false} />
      ))}

      {/* Header */}
      <div className="bg-black border-b border-gray-800 p-3 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button onClick={handleLeave} className="p-2 text-gray-400 hover:text-white rounded-full transition-colors" title="Exit Meet">
            <LogOut size={20} />
          </button>
          <div>
            <h1 className="font-bold text-lg leading-tight">Meet</h1>
            <button 
              onClick={() => setShowParticipants(true)}
              className="text-xs text-blue-500 font-semibold cursor-pointer hover:underline flex items-center gap-1 mt-0.5 text-left"
              title="Click to view all participants"
            >
              <span>#{roomCode}</span>
              <span>•</span>
              <span>{participants.length > 0 ? participants.length : (Object.keys(peers).length + 1)} online</span>
            </button>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={() => startCall('AUDIO')} className={`p-2.5 rounded-full transition-colors ${callType === 'AUDIO' ? 'bg-red-500 text-white' : 'text-[#1877F2] hover:bg-gray-800'}`} title="Start Voice Call">
            {callType === 'AUDIO' ? <PhoneOff size={20} /> : <Phone size={20} />}
          </button>
          <button onClick={() => startCall('VIDEO')} className={`p-2.5 rounded-full transition-colors ${callType === 'VIDEO' ? 'bg-red-500 text-white' : 'text-[#1877F2] hover:bg-gray-800'}`} title="Start Video Call">
            {callType === 'VIDEO' ? <PhoneOff size={20} /> : <Video size={20} />}
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
              {participants.map((p, i) => (
                <div key={p.id || i} className="flex items-center justify-between p-3 rounded-2xl bg-black/50 border border-gray-800/80 hover:border-gray-700 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    {p.avatar ? (
                      <ProfileAvatar userId={p.id} defaultAvatar={p.avatar} name={p.name} className="w-10 h-10 rounded-full object-cover border border-gray-700 shrink-0" />
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
                      <p className="text-[11px] text-gray-400 truncate">ID: {p.id}</p>
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

      {/* MODULE 3: WHATSAPP-STYLE RESPONSIVE CALL LAYOUT & ZERO FLICKERING */}
      {callType && (
        <div className="fixed inset-0 z-[200] bg-[#111111] flex flex-col justify-between overflow-hidden animate-in fade-in duration-300">
          
          {/* Top Duration & Call Info Bar */}
          <div className="absolute top-4 left-0 right-0 z-40 flex flex-col items-center pointer-events-none">
            <div className="bg-black/60 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10 shadow-lg text-center">
              <h2 className="text-sm font-bold text-white tracking-wide">{callType === 'VIDEO' ? 'Video Call' : 'Voice Call'}</h2>
              <p className="text-xs text-gray-300 font-medium">{formatDuration(callDuration)}</p>
            </div>
          </div>

          {/* Video Container Area */}
          <div className="flex-1 w-full h-full relative flex items-center justify-center overflow-hidden">
            
            {/* Case 1: 1-on-1 WhatsApp Full Screen Layout */}
            {isOneOnOne ? (
              <>
                {/* Remote User Video (Takes full 100vw / 100vh with object-fit: cover) */}
                <div className="absolute inset-0 w-full h-full bg-black">
                  {remoteStreamEntries[0][1].getVideoTracks().length > 0 && remoteStreamEntries[0][1].getVideoTracks()[0].enabled ? (
                    <VideoStreamPlayer
                      stream={remoteStreamEntries[0][1]}
                      isMuted={false}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900">
                      <div className="w-24 h-24 rounded-full bg-blue-600/20 flex items-center justify-center mb-4 text-blue-400">
                        <Users size={48} />
                      </div>
                      <span className="text-lg font-bold text-white">{peers[remoteStreamEntries[0][0]]?.profile?.name || 'Friend'}</span>
                    </div>
                  )}
                </div>

                {/* Local User Video (Small floating rectangle at bottom-right) */}
                {localStream && (
                  <div className="absolute bottom-24 right-4 w-32 h-44 sm:w-44 sm:h-60 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 z-50 bg-gray-900">
                    {videoEnabled && callType === 'VIDEO' ? (
                      <VideoStreamPlayer
                        stream={localStream}
                        isMuted={true}
                        isMirrored={true}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-[#1a1a1a]">
                        <Mic size={24} className={micEnabled ? 'text-[#1877F2]' : 'text-red-500'} />
                        <span className="text-xs text-gray-400 mt-2">You</span>
                      </div>
                    )}
                    <span className="absolute bottom-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[10px] font-bold text-white">
                      You
                    </span>
                  </div>
                )}
              </>
            ) : (
              /* Case 2: 3+ Users Grid Layout */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-4 w-full h-full max-w-6xl mx-auto items-center justify-center auto-rows-fr">
                {localStream && (
                  <div className="relative w-full h-full min-h-[160px] max-h-[400px] bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border border-gray-800">
                    {videoEnabled && callType === 'VIDEO' ? (
                      <VideoStreamPlayer
                        stream={localStream}
                        isMuted={true}
                        isMirrored={true}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-[#1a1a1a]">
                        <Mic size={32} className={micEnabled ? 'text-[#1877F2]' : 'text-red-500'} />
                        <span className="text-gray-400 font-medium mt-2">You {!micEnabled && '(Muted)'}</span>
                      </div>
                    )}
                    <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-white">
                      You
                    </div>
                  </div>
                )}

                {remoteStreamEntries.map(([peerId, stream]) => (
                  <div key={peerId} className="relative w-full h-full min-h-[160px] max-h-[400px] bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border border-gray-800">
                    {stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled ? (
                      <VideoStreamPlayer
                        stream={stream}
                        isMuted={false}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-[#1a1a1a]">
                        <VideoStreamPlayer stream={stream} isMuted={false} className="hidden" />
                        <Mic size={32} className="text-gray-400" />
                        <span className="text-gray-400 font-medium mt-2">{peers[peerId]?.profile?.name || 'Guest'}</span>
                      </div>
                    )}
                    <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-white max-w-[80%] truncate">
                      {peers[peerId]?.profile?.name || 'Guest'}
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>

          {/* Call Controls Floating Bar */}
          <div className="absolute bottom-6 left-0 right-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-6 bg-[#1a1a1a]/90 backdrop-blur-xl px-8 py-4 rounded-full border border-gray-800 shadow-2xl pointer-events-auto">
              <button onClick={toggleMic} className={`p-4 rounded-full transition-transform active:scale-95 ${micEnabled ? 'bg-gray-800 hover:bg-gray-700' : 'bg-red-500 shadow-lg shadow-red-500/30'}`}>
                {micEnabled ? <Mic size={24} /> : <MicOff size={24} />}
              </button>
              {callType === 'VIDEO' && (
                <button onClick={toggleVideo} className={`p-4 rounded-full transition-transform active:scale-95 ${videoEnabled ? 'bg-gray-800 hover:bg-gray-700' : 'bg-red-500 shadow-lg shadow-red-500/30'}`}>
                  {videoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
                </button>
              )}
              <button onClick={endCall} className="p-4 rounded-full transition-transform active:scale-95 bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/30">
                <PhoneOff size={24} className="text-white" />
              </button>
            </div>
          </div>

        </div>
      )}

      {/* Incoming Call Popup */}
      {incomingCall && !callType && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-[#111111] p-8 rounded-3xl shadow-2xl border border-gray-800 flex flex-col items-center max-w-sm w-full text-center animate-in zoom-in-95 duration-500">
            {incomingCall.profile?.avatar ? (
              <ProfileAvatar userId={incomingCall.callerId} defaultAvatar={incomingCall.profile.avatar} name={incomingCall.callerName} className="w-24 h-24 rounded-full object-cover mb-4 shadow-lg ring-4 ring-[#1877F2]/30 animate-pulse" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center mb-4 shadow-lg ring-4 ring-[#1877F2]/30 animate-pulse">
                <Users size={32} className="text-gray-400" />
              </div>
            )}
            <h3 className="text-2xl font-bold text-white mb-2">{incomingCall.callerName}</h3>
            <p className="text-gray-400 mb-8 font-medium">Incoming {incomingCall.callType === 'VIDEO' ? 'Video' : 'Voice'} Call...</p>
            
            <div className="flex items-center gap-6 w-full justify-center">
              <button onClick={declineCall} className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600 transition-colors active:scale-95 shadow-lg shadow-red-500/30">
                  <PhoneOff size={28} className="text-white" />
                </div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Decline</span>
              </button>
              <button onClick={acceptCall} className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center hover:bg-green-600 transition-colors active:scale-95 shadow-lg shadow-green-500/30 animate-bounce">
                  {incomingCall.callType === 'VIDEO' ? <Video size={28} className="text-white" /> : <Phone size={28} className="text-white" />}
                </div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Accept</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 scroll-smooth">
        {chatMessages.map(msg => {
          const isMe = msg.sender.id === currentUser?.id;
          const isViewOnceMsg = msg.isViewOnce;
          const isViewed = viewedMessages.has(msg.id);

          return (
            <div key={msg.id} className={`flex items-start gap-2 max-w-[85%] group ${isMe ? 'self-end flex-row-reverse' : 'self-start'}`}>
              <ProfileAvatar userId={msg.sender.id || ''} defaultAvatar={msg.sender.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${msg.sender.name}`} name={msg.sender.name} className="w-8 h-8 rounded-full border border-gray-800 shrink-0 mt-1" />
              
              <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && <span className="text-[11px] font-bold text-gray-400 ml-2 mb-0.5">{msg.sender.name}</span>}
                
                <div className={`p-3 rounded-2xl relative ${isMe ? 'bg-[#1877F2] text-white rounded-tr-none' : 'bg-gray-900 text-white rounded-tl-none border border-gray-800'}`}>
                  {isViewOnceMsg ? (
                    <div 
                      onClick={() => !isViewed && handleOpenViewOnce(msg)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer select-none transition-transform active:scale-95 ${isViewed ? 'bg-black/30 opacity-60' : 'bg-black/40 hover:bg-black/60'}`}
                    >
                      <div className="w-7 h-7 rounded-full border-2 border-dashed border-white/60 flex items-center justify-center text-xs font-black">
                        1
                      </div>
                      <span className="text-sm font-semibold">
                        {isViewed ? 'Opened' : (msg.type === 'IMAGE' ? 'Photo' : 'Voice message')}
                      </span>
                    </div>
                  ) : (
                    <>
                      {msg.type === 'IMAGE' && msg.imageUrl && (
                        <img src={msg.imageUrl} className="rounded-xl max-w-full max-h-60 object-cover border border-white/10 mb-1" alt="Chat attachment" />
                      )}
                      
                      {msg.type === 'VOICE' && msg.audioUrl && (
                        <audio controls src={msg.audioUrl} className="max-w-[220px] sm:max-w-[280px] h-10" />
                      )}

                      {msg.type === 'TEXT' && (
                        <p className="text-sm break-words whitespace-pre-wrap">{msg.text}</p>
                      )}
                    </>
                  )}

                  <span className="text-[9px] opacity-60 mt-1 block text-right">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {isMe && (
                <button onClick={() => deleteMessage(msg.id)} className="opacity-0 group-hover:opacity-100 p-2 text-gray-500 hover:text-red-500 transition-all self-center shrink-0">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          );
        })}
        <div id="chat-bottom-anchor" />
      </div>

      {/* View Once Media Modal */}
      {viewingOnceMedia && (
        <div className="fixed inset-0 z-[300] bg-black/95 flex flex-col items-center justify-center p-4">
          <button onClick={closeViewOnce} className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white">
            <X size={24} />
          </button>
          <div className="max-w-md w-full flex flex-col items-center">
            {viewingOnceMedia.type === 'IMAGE' && (
              <img src={viewingOnceMedia.imageUrl} className="max-h-[75vh] max-w-full object-contain rounded-2xl shadow-2xl" alt="View Once" />
            )}
            {viewingOnceMedia.type === 'VOICE' && (
              <div className="p-8 bg-gray-900 border border-gray-800 rounded-3xl flex flex-col items-center gap-4">
                <audio autoPlay controls src={viewingOnceMedia.audioUrl} className="w-full" />
                <p className="text-sm text-gray-400">View-Once Audio Playing</p>
              </div>
            )}
            <p className="text-gray-400 text-xs mt-4">This media will disappear once closed</p>
          </div>
        </div>
      )}

      {/* Image Preview Overlay */}
      {previewImageUrl && (
        <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur flex flex-col p-4">
          <div className="flex items-center justify-between p-2">
            <button onClick={cancelImagePreview} className="text-gray-400 hover:text-white p-2">
              <X size={24} />
            </button>
            <button 
              onClick={() => setIsViewOnce(!isViewOnce)} 
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-all ${isViewOnce ? 'bg-[#1877F2] border-blue-400 text-white' : 'border-gray-700 text-gray-400 hover:text-white'}`}
            >
              <span className="w-4 h-4 rounded-full border border-dashed border-current flex items-center justify-center text-[10px]">1</span>
              View Once
            </button>
          </div>
          
          <div className="flex-1 flex items-center justify-center p-4">
            <img src={previewImageUrl} className="max-h-[60vh] max-w-full object-contain rounded-2xl shadow-2xl" alt="Preview" />
          </div>

          <div className="p-4 flex items-center justify-end">
            <button onClick={sendImageMessage} className="bg-[#1877F2] text-white p-4 rounded-full shadow-xl hover:bg-blue-600 transition-transform active:scale-95">
              <Send size={24} />
            </button>
          </div>
        </div>
      )}

      {/* Bottom Bar: Chat Input or Voice Recording UX */}
      <div className="shrink-0 bg-gray-900 border-t border-gray-800 p-2.5 pb-safe">
        {recordState === 'RECORDING' ? (
          <div className="flex items-center justify-between bg-black/80 rounded-full px-4 py-2 border border-red-500/30 animate-pulse">
            <div className="flex items-center gap-2 text-red-500">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-ping"></span>
              <span className="text-sm font-bold">{formatDuration(recordingDuration)}</span>
            </div>
            <p className="text-xs text-gray-400">Recording audio...</p>
            <div className="flex items-center gap-2">
              <button onClick={cancelRecording} className="p-2 text-gray-400 hover:text-white">
                <Trash2 size={20} />
              </button>
              <button onClick={stopRecording} className="p-2 bg-red-500 text-white rounded-full">
                <Square size={18} />
              </button>
            </div>
          </div>
        ) : recordState === 'PREVIEW' ? (
          <div className="flex items-center gap-2 bg-black/80 rounded-full px-4 py-2 border border-blue-500/30">
            <button onClick={cancelRecording} className="p-2 text-gray-400 hover:text-white">
              <Trash2 size={20} />
            </button>
            <audio controls src={previewAudioUrl || ''} className="flex-1 h-8" />
            <button 
              onClick={() => setIsViewOnce(!isViewOnce)} 
              className={`p-2 rounded-full border text-xs font-bold ${isViewOnce ? 'bg-[#1877F2] border-blue-400 text-white' : 'border-gray-700 text-gray-400'}`}
              title="Toggle View Once"
            >
              <span className="w-4 h-4 rounded-full border border-dashed border-current flex items-center justify-center text-[10px]">1</span>
            </button>
            <button onClick={sendVoiceMessage} className="p-2.5 bg-[#1877F2] text-white rounded-full hover:bg-blue-600 transition-transform active:scale-95">
              <Send size={18} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
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
                <label className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer" title="Send Image">
                  <ImageIcon size={18} />
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                </label>
                {chatInput.trim() ? (
                  <button onClick={sendMessage} className="p-1.5 text-[#1877F2] bg-blue-500/10 rounded-full hover:bg-blue-500/20 transition-colors">
                    <Send size={16} />
                  </button>
                ) : (
                  <button onClick={startRecording} className="p-1.5 text-gray-400 hover:text-[#1877F2] rounded-full hover:bg-white/10 transition-colors" title="Record Voice">
                    <Mic size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .pb-safe {
          padding-bottom: env(safe-area-inset-bottom);
        }
      `}</style>
    </div>
  );
};

export default Meet;
