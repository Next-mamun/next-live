const fs = require('fs');
let code = fs.readFileSync('src/pages/Cinema.tsx', 'utf8');

code = code.replace(/localStream\.getAudioTracks/g, `(window as any).cinemaLocalStream.getAudioTracks`);
code = code.replace(/localStream\.getVideoTracks/g, `(window as any).cinemaLocalStream.getVideoTracks`);
code = code.replace(/if \(localStream && /g, `if ((window as any).cinemaLocalStream && `);

fs.writeFileSync('src/pages/Cinema.tsx', code);
