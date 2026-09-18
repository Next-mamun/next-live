const fs = require('fs');
let code = fs.readFileSync('src/components/Sidebar.tsx', 'utf-8');
code = "import { useGlobalStore } from '@/store/useGlobalStore';\n" + code;
fs.writeFileSync('src/components/Sidebar.tsx', code);
