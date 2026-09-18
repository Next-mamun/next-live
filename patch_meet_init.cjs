const fs = require('fs');
let code = fs.readFileSync('src/pages/Meet.tsx', 'utf8');

code = code.replace(
  /if \(view === 'ROOM' \|\| !isHost\) {\n      initPeerJS\(roomCode, isHost\);\n    }/g,
  `initPeerJS(roomCode, isHost);`
);

fs.writeFileSync('src/pages/Meet.tsx', code);
