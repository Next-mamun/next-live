const fs = require('fs');
let code = fs.readFileSync('src/pages/Cinema.tsx', 'utf8');

// Replace getMediaStream
const getMediaStreamMatch = /const getMediaStream = async \(\) => \{[\s\S]*?\n  \};\n/g;

const replacement = `const getMediaStream = async (reqAudio: boolean, reqVideo: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: reqAudio, video: reqVideo });
      
      if (localStream) {
        // Merge new tracks into existing stream
        const newTracks = stream.getTracks();
        newTracks.forEach(track => {
           // Remove old track of same kind if exists
           const existingTrack = localStream.getTracks().find(t => t.kind === track.kind);
           if (existingTrack) {
              existingTrack.stop();
              localStream.removeTrack(existingTrack);
           }
           localStream.addTrack(track);
        });
        
        // Re-call everyone with the updated stream
        callAllPeers(localStream);
        return localStream;
      } else {
        setLocalStream(stream);
        return stream;
      }
    } catch (e) {
      toast.error("Media permission denied");
      return null;
    }
  };
`;
code = code.replace(getMediaStreamMatch, replacement);

// Now update toggleMic
const toggleMicMatch = /const toggleMic = async \(\) => \{[\s\S]*?\n  \};\n/g;
const newToggleMic = `const toggleMic = async () => {
    if (micEnabled) {
       // Disable mic
       if (localStream) {
          localStream.getAudioTracks().forEach(t => t.enabled = false);
       }
       setMicEnabled(false);
    } else {
       // Enable mic
       if (localStream && localStream.getAudioTracks().length > 0) {
          localStream.getAudioTracks().forEach(t => t.enabled = true);
          setMicEnabled(true);
       } else {
          const stream = await getMediaStream(true, videoEnabled);
          if (stream) {
             setMicEnabled(true);
             if (!localStream) callAllPeers(stream);
          }
       }
    }
  };
`;
code = code.replace(toggleMicMatch, newToggleMic);

// Update toggleVideo
const toggleVideoMatch = /const toggleVideo = async \(\) => \{[\s\S]*?\n  \};\n/g;
const newToggleVideo = `const toggleVideo = async () => {
    if (videoEnabled) {
       // Disable video
       if (localStream) {
          localStream.getVideoTracks().forEach(t => {
             t.stop();
             localStream.removeTrack(t);
          });
       }
       setVideoEnabled(false);
    } else {
       // Enable video
       const stream = await getMediaStream(micEnabled, true);
       if (stream) {
          setVideoEnabled(true);
          if (!localStream) callAllPeers(stream);
       }
    }
  };
`;
code = code.replace(toggleVideoMatch, newToggleVideo);

fs.writeFileSync('src/pages/Cinema.tsx', code);
