const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');
const lines = code.split('\n');
lines[1039] = "            // Avoid fetching contacts repeatedly";
fs.writeFileSync('src/pages/Messages.tsx', lines.join('\n'));
