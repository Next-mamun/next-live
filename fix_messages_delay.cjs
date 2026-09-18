const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');

// Inside fetch contacts, make sure the msg limit is correct
code = code.replace(/limit\(500\)/g, 'limit(50)');

fs.writeFileSync('src/pages/Messages.tsx', code);
