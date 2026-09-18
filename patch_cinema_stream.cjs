const fs = require('fs');
let code = fs.readFileSync('src/pages/Cinema.tsx', 'utf8');

code = code.replace(/localStream\.getTracks\(\)/g, `(window as any).cinemaLocalStream.getTracks()`);
code = code.replace(/localStream\.removeTrack/g, `(window as any).cinemaLocalStream.removeTrack`);
code = code.replace(/localStream\.addTrack/g, `(window as any).cinemaLocalStream.addTrack`);
code = code.replace(/callAllPeers\(localStream\)/g, `callAllPeers((window as any).cinemaLocalStream)`);

fs.writeFileSync('src/pages/Cinema.tsx', code);
