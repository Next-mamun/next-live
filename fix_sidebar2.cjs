const fs = require('fs');
let code = fs.readFileSync('src/components/Sidebar.tsx', 'utf-8');

code = code.replace(/import \{ collection, query, where, getDocs \} from 'firebase\/firestore';/, `import { collection, query, where, getDocs, limit } from 'firebase/firestore';`);

fs.writeFileSync('src/components/Sidebar.tsx', code);
console.log('Modified Sidebar.tsx');
