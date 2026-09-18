const fs = require('fs');
let code = fs.readFileSync('src/pages/Meet.tsx', 'utf8');

// The render for ROOM starts around line 547:
const roomRenderStart = `{/* Header */}`;
const callStripReplacement = `
      {/* Call UI (Full Screen if active) */}
      {callType && (
        <div className="absolute inset-0 z-50 bg-[#111111] flex flex-col items-center justify-between p-6 animate-in fade-in slide-in-from-bottom-10 duration-300">
           {/* Top Info */}
           <div className="flex flex-col items-center mt-10 gap-2">
              <h2 className="text-2xl font-bold text-white tracking-wide">{callType === 'VIDEO' ? 'Group Video Call' : 'Group Voice Call'}</h2>
              <p className="text-gray-400 font-medium">{formatDuration(callDuration)}</p>
           </div>
           
           {/* Grids */}
           <div className="flex-1 w-full max-w-4xl flex flex-wrap items-center justify-center gap-4 my-8 overflow-y-auto">
             {localStream && (
               <div className="relative w-40 h-56 sm:w-64 sm:h-80 bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border border-gray-800 shrink-0 animate-in zoom-in">
                 {videoEnabled && callType === 'VIDEO' ? (
                   <video autoPlay playsInline muted ref={el => { if (el) el.srcObject = localStream }} className="w-full h-full object-cover scale-x-[-1]" />
                 ) : (
                   <div className="w-full h-full flex flex-col items-center justify-center bg-[#1a1a1a]">
                      <div className="w-20 h-20 rounded-full bg-[#1877F2]/20 flex items-center justify-center mb-4">
                        <Mic size={32} className={micEnabled ? 'text-[#1877F2]' : 'text-red-500'} />
                      </div>
                      <span className="text-gray-400 font-medium">You {!micEnabled && '(Muted)'}</span>
                   </div>
                 )}
                 <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-white">
                   You
                 </div>
               </div>
             )}
             
             {Object.entries(remoteStreams).map(([peerId, stream]) => (
               <div key={peerId} className="relative w-40 h-56 sm:w-64 sm:h-80 bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border border-gray-800 shrink-0 animate-in zoom-in">
                 {stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled ? (
                   <video autoPlay playsInline ref={el => { if (el) el.srcObject = stream }} className="w-full h-full object-cover" />
                 ) : (
                   <div className="w-full h-full flex flex-col items-center justify-center bg-[#1a1a1a]">
                      <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center mb-4">
                        <Mic size={32} className="text-gray-400" />
                      </div>
                      <span className="text-gray-400 font-medium">{peers[peerId]?.profile?.name || 'Guest'}</span>
                   </div>
                 )}
                 <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-white max-w-[80%] truncate">
                   {peers[peerId]?.profile?.name || 'Guest'}
                 </div>
               </div>
             ))}
           </div>
           
           {/* Controls */}
           <div className="flex items-center gap-6 bg-[#1a1a1a]/80 backdrop-blur-xl px-8 py-4 rounded-full border border-gray-800 shadow-2xl mb-10 shrink-0">
              <button onClick={toggleMic} className={\`p-4 rounded-full transition-transform active:scale-95 \${micEnabled ? 'bg-gray-800 hover:bg-gray-700' : 'bg-red-500 shadow-lg shadow-red-500/30'}\`}>
                {micEnabled ? <Mic size={24} /> : <MicOff size={24} />}
              </button>
              {callType === 'VIDEO' && (
                <button onClick={toggleVideo} className={\`p-4 rounded-full transition-transform active:scale-95 \${videoEnabled ? 'bg-gray-800 hover:bg-gray-700' : 'bg-red-500 shadow-lg shadow-red-500/30'}\`}>
                  {videoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
                </button>
              )}
              <button onClick={endCall} className="p-4 rounded-full transition-transform active:scale-95 bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/30">
                <PhoneOff size={24} className="text-white" />
              </button>
           </div>
        </div>
      )}

      {/* Incoming Call Popup */}
      {incomingCall && !callType && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="bg-[#111111] p-8 rounded-3xl shadow-2xl border border-gray-800 flex flex-col items-center max-w-sm w-full text-center animate-in zoom-in-95 duration-500">
              {incomingCall.profile?.avatar ? (
                 <img src={incomingCall.profile.avatar} className="w-24 h-24 rounded-full object-cover mb-4 shadow-lg ring-4 ring-[#1877F2]/30 animate-pulse" />
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
`;

const replaceTarget = /\{\/\* Group Call Strip \*\/\}[\s\S]*?\{\/\* Chat History \*\/\}/;

if(replaceTarget.test(code)) {
  code = code.replace(replaceTarget, callStripReplacement + `\n      {/* Chat History */}`);
  fs.writeFileSync('src/pages/Meet.tsx', code);
  console.log("Patched successfully!");
} else {
  console.log("Could not find the target section.");
}

