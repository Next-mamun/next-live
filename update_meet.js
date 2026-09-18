const fs = require('fs');
let code = fs.readFileSync('src/pages/Meet.tsx', 'utf8');

// Replace green with blue
code = code.replace(/#25D366/g, '#1877F2');
code = code.replace(/green-500/g, 'blue-500');
code = code.replace(/green-600/g, 'blue-600');
code = code.replace(/green-400/g, 'blue-400');
code = code.replace(/#005c4b/g, '#1877F2'); // WhatsApp dark green bubble to blue
code = code.replace(/bg-gray-950/g, 'bg-[#000000]'); // Make background truly dark
code = code.replace(/bg-gray-900/g, 'bg-[#111111]'); 
code = code.replace(/bg-\[\#0f172a\]/g, 'bg-[#000000]');

fs.writeFileSync('src/pages/Meet.tsx', code);
