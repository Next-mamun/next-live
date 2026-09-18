const fs = require('fs');
let code = fs.readFileSync('src/pages/Cinema.tsx', 'utf8');

code = code.replace(
  /setRoomCode\(code\);\n    setIsHost\(false\);\n    initPeerJS\(code, false\);\n    setView\('LOBBY'\);/g,
  `setRoomCode(code);
    setIsHost(false);
    initPeerJS(code, false);
    enterRoom(code);`
);

fs.writeFileSync('src/pages/Cinema.tsx', code);
