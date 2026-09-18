const fs = require('fs');
let code = fs.readFileSync('src/pages/Meet.tsx', 'utf8');

code = code.replace(
  /\}, \[roomCode, view\]\);/g,
  `}, [roomCode, isHost]);`
);

fs.writeFileSync('src/pages/Meet.tsx', code);
