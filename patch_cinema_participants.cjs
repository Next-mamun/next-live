const fs = require('fs');
let code = fs.readFileSync('src/pages/Cinema.tsx', 'utf8');

// 1. Add participants state
code = code.replace(
  /const \[peers, setPeers\] = useState<Record<string, PeerInfo>>\(\{\}\);/g,
  `const [peers, setPeers] = useState<Record<string, PeerInfo>>({});
  const [participants, setParticipants] = useState<any[]>([]);
  const [showParticipants, setShowParticipants] = useState(false);`
);

// 2. Add useEffect to sync participants if host
code = code.replace(
  /const initPeerJS = /g,
  `useEffect(() => {
    if (isHost && currentUser) {
       const hostUser = { id: currentUser.id, name: currentUser.display_name, isHost: true };
       const guestUsers = Object.values(peers).map((p: any) => ({
          id: p.profile?.id || p.id,
          name: p.profile?.name || 'Guest',
          isHost: false
       }));
       const allParticipants = [hostUser, ...guestUsers];
       setParticipants(allParticipants);
       broadcast({ type: 'SYNC_PARTICIPANTS', participants: allParticipants });
    }
  }, [peers, isHost, currentUser]);

  const initPeerJS = `
);

// 3. Handle SYNC_PARTICIPANTS in handlePeerData
code = code.replace(
  /case 'PEER_IDENTITY':/g,
  `case 'SYNC_PARTICIPANTS':
        if (!isHost) setParticipants(data.participants);
        break;
      case 'PEER_IDENTITY':`
);

// 4. Update the UI to show participants count from state (or fallback to peers length) and handle click
const uiMatch = /<div className="flex items-center gap-1\.5 text-sm font-medium bg-black\/60 backdrop-blur px-3 py-1\.5 rounded-full border border-white\/10">[\s\S]*?<\/div>/g;
const uiReplacement = `<div 
            onClick={() => setShowParticipants(true)}
            className="flex items-center gap-1.5 text-sm font-medium bg-black/60 backdrop-blur px-3 py-1.5 rounded-full border border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
          >
            <Users size={16} />
            {participants.length > 0 ? participants.length : (Object.keys(peers).length + 1)}
          </div>`;
code = code.replace(uiMatch, uiReplacement);

// 5. Add Participants Modal UI inside the return, before Floating Reactions
const modalUI = `{showParticipants && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowParticipants(false)}>
           <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                 <h3 className="text-lg font-bold text-white">Participants ({participants.length})</h3>
                 <button onClick={() => setShowParticipants(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
              </div>
              <div className="max-h-60 overflow-y-auto p-2">
                 {participants.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-800 transition-colors">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500 font-bold">
                             {p.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                             <p className="font-bold text-white text-sm">{p.name} {p.id === currentUser?.id ? '(You)' : ''}</p>
                             <p className="text-xs text-gray-400">{p.isHost ? 'Host' : 'Guest'}</p>
                          </div>
                       </div>
                    </div>
                 ))}
                 {participants.length === 0 && (
                    <div className="p-4 text-center text-gray-500">Only you are here...</div>
                 )}
              </div>
           </div>
        </div>
      )}
      
      {/* FLOATING REACTIONS */}`;
code = code.replace(/\{\/\* FLOATING REACTIONS \*\/\}/g, modalUI);

fs.writeFileSync('src/pages/Cinema.tsx', code);
