const fs = require('fs');
let code = fs.readFileSync('src/pages/Settings.tsx', 'utf-8');

// replace require with proper import if needed
code = code.replace(/const \{ localDB \} = require\('@\/lib\/dexie'\);/g, '');

if (!code.includes("import { localDB }")) {
  code = "import { localDB } from '@/lib/dexie';\n" + code;
}

fs.writeFileSync('src/pages/Settings.tsx', code);
console.log('Fixed Settings imports');
