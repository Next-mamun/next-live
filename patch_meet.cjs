const fs = require('fs');
let code = fs.readFileSync('src/pages/Meet.tsx', 'utf8');

// 1. Add ringtone audio reference
code = code.replace(
  `const [incomingCall, setIncomingCall] = useState`, 
  `// placeholder`
); // Doesn't exist yet, we will add it to states

// Replace the states block
const statesRegex = /const \[callType, setCallType\] = useState<'AUDIO' \| 'VIDEO' \| null>\(null\);/g;
code = code.replace(statesRegex, `const [callType, setCallType] = useState<'AUDIO' | 'VIDEO' | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ callerId: string, callerName: string, callType: 'AUDIO'|'VIDEO', profile?: UserProfile } | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const callTimerRef = useRef<any>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);`);

// 2. Add ringtone initialization in useEffect
code = code.replace(`// P2P State`, `// P2P State
  useEffect(() => {
    ringtoneRef.current = new Audio('https://actions.google.com/sounds/v1/alarms/phone_ringing.ogg');
    ringtoneRef.current.loop = true;
  }, []);`);

// 3. Modifying handlePeerData for ring signaling
const handlePeerDataRegex = /case 'TYPING':/g;
code = code.replace(handlePeerDataRegex, `case 'RINGING':
        if (!amIInCallRef.current) {
          setIncomingCall({ callerId: peerId, callerName: data.callerName, callType: data.callType, profile: data.profile });
          ringtoneRef.current?.play().catch(e => console.log('Audio play error', e));
        }
        break;
      case 'CANCEL_RING':
        setIncomingCall(null);
        ringtoneRef.current?.pause();
        if (ringtoneRef.current) ringtoneRef.current.currentTime = 0;
        break;
      case 'JOINED_CALL':
        // No action needed specifically, peerJS will connect
        break;
      case 'TYPING':`);

// 4. Update startCall to signal instead of just local stream (or get local stream AND signal)
// We need `amIInCallRef`
const refsRegex = /const peersRef = useRef\(peers\);/g;
code = code.replace(refsRegex, `const amIInCallRef = useRef(false);
  const peersRef = useRef(peers);`);

const startCallReplacement = `const startCall = async (type: 'AUDIO' | 'VIDEO') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'VIDEO' });
      setLocalStream(stream);
      setCallType(type);
      setMicEnabled(true);
      setVideoEnabled(type === 'VIDEO');
      amIInCallRef.current = true;
      
      setCallDuration(0);
      clearInterval(callTimerRef.current);
      callTimerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000);

      // Ring everyone else
      broadcast({ type: 'RINGING', callerName: currentUser?.display_name || 'Someone', callType: type, profile: currentUser });
      
      // Call anyone already in the call
      Object.values(peersRef.current).forEach(p => {
        peerRef.current!.call(p.id, stream, { metadata: { type } });
      });
    } catch (err) {
      toast.error(type === 'VIDEO' ? "Camera or Mic access denied. Please allow it in your browser settings." : "Mic access denied. Please allow it in your browser settings.");
    }
  };

  const endCall = () => {
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      setLocalStream(null);
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'VIDEO' });
      setLocalStream(stream);
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
      toast.error("Media access denied.");
    }
  };

  const declineCall = () => {
    setIncomingCall(null);
    ringtoneRef.current?.pause();
  };

  // Re-define how peerJS receives call
`;

// Replace startCall implementation
const startCallMatch = /const startCall = async[\s\S]*?toggleMic = \(\) => {/g;
code = code.replace(startCallMatch, startCallReplacement + `\n  const toggleMic = () => {`);

// 5. Update initPeerJS to answer calls properly with amIInCallRef
code = code.replace(`peer.on('call', (call) => {
      // Auto answer calls in meet if we are in call
      if (localStream) {
         call.answer(localStream);
      } else {
         call.answer(undefined);
      }
      call.on('stream', (userVideoStream) => {
        setRemoteStreams(prev => ({ ...prev, [call.peer]: userVideoStream }));
      });
    });`, `peer.on('call', (call) => {
      if (amIInCallRef.current) {
         call.answer(window.localStreamRef || undefined);
         call.on('stream', (userVideoStream) => {
           setRemoteStreams(prev => ({ ...prev, [call.peer]: userVideoStream }));
         });
      }
    });`);

code = code.replace(/setLocalStream\(stream\);/g, `setLocalStream(stream); window.localStreamRef = stream;`);

fs.writeFileSync('src/pages/Meet.tsx', code);
